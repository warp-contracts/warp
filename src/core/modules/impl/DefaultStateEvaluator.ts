import Arweave from 'arweave';

import { SortKeyCacheResult } from '../../../cache/SortKeyCache';
import { InteractionCall } from '../../ContractCallRecord';
import { ExecutionContext } from '../../../core/ExecutionContext';
import { ExecutionContextModifier } from '../../../core/ExecutionContextModifier';
import { GQLNodeInterface, GQLTagInterface } from '../../../legacy/gqlResult';
import { Benchmark } from '../../../logging/Benchmark';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { indent } from '../../../utils/utils';
import { EvalStateResult, StateEvaluator } from '../StateEvaluator';
import { ContractInteraction, HandlerApi, InteractionResult } from './HandlerExecutorFactory';
import { TagsParser } from './TagsParser';
import { VrfPluginFunctions } from '../../WarpPlugin';
import { BasicSortKeyCache } from '../../../cache/BasicSortKeyCache';
import { KnownErrors } from './handler/JsHandlerApi';

type EvaluationProgressInput = {
  contractTxId: string;
  currentInteraction: number;
  allInteractions: number;
  lastInteractionProcessingTime: string;
};

/**
 * This class contains the base functionality of evaluating the contracts state - according
 * to the SmartWeave protocol.
 * Marked as abstract - as without help of any cache - the evaluation in real-life applications
 * would be really slow - so using this class without any caching ({@link CacheableStateEvaluator})
 * mechanism built on top makes no sense.
 */
export abstract class DefaultStateEvaluator implements StateEvaluator {
  private readonly logger = LoggerFactory.INST.create('DefaultStateEvaluator');

  private readonly tagsParser = new TagsParser();

  protected constructor(
    protected readonly arweave: Arweave,
    private readonly executionContextModifiers: ExecutionContextModifier[] = []
  ) {}

  async eval<State>(
    executionContext: ExecutionContext<State, HandlerApi<State>>
  ): Promise<SortKeyCacheResult<EvalStateResult<State>>> {
    return this.doReadState(
      executionContext.sortedInteractions,
      new EvalStateResult<State>(executionContext.contractDefinition.initState, {}, {}),
      executionContext
    );
  }

  protected async doReadState<State>(
    missingInteractions: GQLNodeInterface[],
    baseState: EvalStateResult<State>,
    executionContext: ExecutionContext<State, HandlerApi<State>>
  ): Promise<SortKeyCacheResult<EvalStateResult<State>>> {
    const { ignoreExceptions, stackTrace, internalWrites } = executionContext.evaluationOptions;
    const { contract, contractDefinition, sortedInteractions, warp } = executionContext;

    let currentState = baseState.state;
    let currentSortKey = null;
    const validity = baseState.validity;
    const errorMessages = baseState.errorMessages;

    // TODO: opt - reuse wasm handlers
    executionContext?.handler.initState(currentState);
    const depth = executionContext.contract.callDepth();

    this.logger.debug(
      `${indent(depth)}Evaluating state for ${contractDefinition.txId} [${missingInteractions.length} non-cached of ${
        sortedInteractions.length
      } all]`
    );

    let errorMessage = null;
    const missingInteractionsLength = missingInteractions.length;

    const evmSignatureVerificationPlugin = warp.maybeLoadPlugin<GQLNodeInterface, Promise<boolean>>(
      'evm-signature-verification'
    );
    const progressPlugin = warp.maybeLoadPlugin<EvaluationProgressInput, void>('evaluation-progress');
    const vrfPlugin = warp.maybeLoadPlugin<void, VrfPluginFunctions>('vrf');

    let shouldBreakAfterEvolve = false;

    for (let i = 0; i < missingInteractionsLength; i++) {
      if (shouldBreakAfterEvolve) {
        break;
      }

      const missingInteraction = missingInteractions[i];
      currentSortKey = missingInteraction.sortKey;
      contract
        .interactionState()
        .setInitial(contract.txId(), new EvalStateResult(currentState, validity, errorMessages), currentSortKey);
      const singleInteractionBenchmark = Benchmark.measure();

      if (missingInteraction.vrf) {
        if (!vrfPlugin) {
          this.logger.warn('Cannot verify vrf for interaction - no "warp-contracts-plugin-vrf" attached!');
        } else {
          if (!vrfPlugin.process().verify(missingInteraction.vrf, missingInteraction.sortKey)) {
            throw new Error('Vrf verification failed.');
          }
        }
      }

      if (evmSignatureVerificationPlugin && this.tagsParser.isEvmSigned(missingInteraction)) {
        try {
          if (!(await evmSignatureVerificationPlugin.process(missingInteraction))) {
            this.logger.warn(`Interaction ${missingInteraction.id} was not verified, skipping.`);
            continue;
          }
        } catch (e) {
          this.logger.error(e);
          continue;
        }
      }

      this.logger.debug(
        `${indent(depth)}[${contractDefinition.txId}][${missingInteraction.id}][${missingInteraction.block.height}]: ${
          missingInteractions.indexOf(missingInteraction) + 1
        }/${missingInteractions.length} [of all:${sortedInteractions.length}]`
      );

      const isInteractWrite = this.tagsParser.isInteractWrite(missingInteraction, contractDefinition.txId);
      // other contract makes write ("writing contract") on THIS contract
      if (isInteractWrite && internalWrites) {
        // evaluating txId of the contract that is writing on THIS contract
        const writingContractTxId = this.tagsParser.getContractTag(missingInteraction);
        this.logger.debug(`${indent(depth)}Internal Write - Loading writing contract`, writingContractTxId);

        const interactionCall: InteractionCall = contract
          .getCallStack()
          .addInteractionData({ interaction: null, interactionTx: missingInteraction });

        // creating a Contract instance for the "writing" contract
        const writingContract = warp.contract(writingContractTxId, executionContext.contract, {
          callingInteraction: missingInteraction,
          callType: 'read'
        });

        this.logger.debug(`${indent(depth)}Reading state of the calling contract at`, missingInteraction.sortKey);
        /**
         Reading the state of the writing contract.
         This in turn will cause the state of THIS contract to be
         updated in 'interaction state'
         */
        let newState: EvalStateResult<unknown> = null;
        let writingContractState: SortKeyCacheResult<EvalStateResult<unknown>> = null;
        try {
          writingContractState = await writingContract.readState(missingInteraction.sortKey);
          newState = contract.interactionState().get(contract.txId(), missingInteraction.sortKey);
        } catch (e) {
          // ppe: not sure why we're not handling all ContractErrors here...
          if (
            (e.name == KnownErrors.ContractError &&
              (e.subtype == 'unsafeClientSkip' || e.subtype == 'constructor' || e.subtype == 'blacklistedSkip')) ||
            e.name == KnownErrors.NonWhitelistedSourceError
          ) {
            this.logger.warn(`Skipping contract in internal write, reason ${e.subtype}`);
            errorMessages[missingInteraction.id] = e.message?.slice(0, 10_000);
          } else {
            throw e;
          }
        }

        if (newState !== null && writingContractState !== null) {
          const parentValidity = writingContractState.cachedValue.validity[missingInteraction.id];
          if (parentValidity) {
            currentState = newState.state as State;
          }
          // we need to update the state in the wasm module
          // TODO: opt - reuse wasm handlers...
          executionContext?.handler.initState(currentState);

          if (parentValidity) {
            validity[missingInteraction.id] = newState.validity[missingInteraction.id];
            if (newState.errorMessages?.[missingInteraction.id]) {
              errorMessages[missingInteraction.id] = newState.errorMessages[missingInteraction.id]?.slice(0, 10_000);
            }
          } else {
            validity[missingInteraction.id] = false;
            errorMessages[missingInteraction.id] = writingContractState.cachedValue.errorMessages[
              missingInteraction.id
            ]?.slice(0, 10_000);
          }
        } else {
          validity[missingInteraction.id] = false;
        }

        interactionCall.update({
          cacheHit: false,
          outputState: stackTrace.saveState ? currentState : undefined,
          executionTime: singleInteractionBenchmark.elapsed(true) as number,
          valid: validity[missingInteraction.id],
          errorMessage: errorMessage,
          gasUsed: 0 // TODO...
        });
      } else {
        // "direct" interaction with this contract - "standard" processing
        const inputTag = this.tagsParser.getInputTag(missingInteraction, executionContext.contractDefinition.txId);
        if (!inputTag) {
          this.logger.error(`${indent(depth)}Skipping tx - Input tag not found for ${missingInteraction.id}`);
          continue;
        }
        const input = this.parseInput(inputTag);
        if (!input) {
          this.logger.error(`${indent(depth)}Skipping tx - invalid Input tag - ${missingInteraction.id}`);
          continue;
        }

        const interaction: ContractInteraction<unknown> = {
          input,
          caller: missingInteraction.owner.address,
          interactionType: 'write'
        };

        const interactionData = {
          interaction,
          interactionTx: missingInteraction
        };

        const interactionCall: InteractionCall = contract.getCallStack().addInteractionData(interactionData);

        const result = await executionContext.handler.handle(
          executionContext,
          new EvalStateResult(currentState, validity, errorMessages),
          interactionData
        );

        errorMessage = result.errorMessage;
        if (result.type !== 'ok') {
          errorMessages[missingInteraction.id] = errorMessage?.slice(0, 10_000);
        }

        this.logResult<State>(result, missingInteraction, executionContext);

        this.logger.debug(`${indent(depth)}Interaction evaluation`, singleInteractionBenchmark.elapsed());

        interactionCall.update({
          cacheHit: false,
          outputState: stackTrace.saveState ? currentState : undefined,
          executionTime: singleInteractionBenchmark.elapsed(true) as number,
          valid: validity[missingInteraction.id],
          errorMessage: errorMessage,
          gasUsed: result.gasUsed
        });

        if (result.type === 'exception' && ignoreExceptions !== true) {
          throw new Error(`Exception while processing ${JSON.stringify(interaction)}:\n${result.errorMessage}`);
        }

        validity[missingInteraction.id] = result.type === 'ok';
        currentState = result.state;
      }

      if (progressPlugin) {
        progressPlugin.process({
          contractTxId: contractDefinition.txId,
          allInteractions: missingInteractionsLength,
          currentInteraction: i,
          lastInteractionProcessingTime: singleInteractionBenchmark.elapsed() as string
        });
      }

      try {
        for (const { modify } of this.executionContextModifiers) {
          executionContext = await modify<State>(currentState, executionContext);
        }
      } catch (e) {
        if (
          (e.name == KnownErrors.ContractError && e.subtype == 'unsafeClientSkip') ||
          e.name == KnownErrors.NonWhitelistedSourceError
        ) {
          validity[missingInteraction.id] = false;
          errorMessages[missingInteraction.id] = e.message?.slice(0, 10_000);
          shouldBreakAfterEvolve = true;
        } else {
          throw e;
        }
      }

      if (validity[missingInteraction.id] === undefined || validity[missingInteraction.id] === null) {
        throw new Error('Validity not set after interaction evaluation');
      }

      const forceStateStoreToCache =
        executionContext.evaluationOptions.cacheEveryNInteractions > 0 &&
        i % executionContext.evaluationOptions.cacheEveryNInteractions === 0;
      const interactionState = new EvalStateResult(currentState, validity, errorMessages);
      contract.interactionState().update(contract.txId(), interactionState, currentSortKey);
      if (contract.isRoot()) {
        this.logger.debug(`End of interaction ${missingInteraction.sortKey}.`);
        contract.clearChildren();
        if (validity[missingInteraction.id]) {
          this.logger.debug(`Commit for contract ${contract.txId()}`);
          await contract.interactionState().commit(missingInteraction, forceStateStoreToCache);
        } else {
          this.logger.debug(`Rollback for contract ${contract.txId()}`);
          await contract.interactionState().rollback(missingInteraction, forceStateStoreToCache);
        }
      }
    }
    const evalStateResult = new EvalStateResult<State>(currentState, validity, errorMessages);

    // state could have been fully retrieved from cache
    // or there were no interactions below requested sort key
    if (missingInteractionsLength > 0) {
      await this.onStateEvaluated(
        missingInteractions[missingInteractionsLength - 1],
        executionContext,
        evalStateResult
      );
    }

    return new SortKeyCacheResult(currentSortKey, evalStateResult);
  }

  private logResult<State>(
    result: InteractionResult<State, unknown>,
    currentTx: GQLNodeInterface,
    executionContext: ExecutionContext<State, HandlerApi<State>>
  ) {
    if (result.type === 'exception') {
      this.logger.error(
        `Executing of interaction: [${executionContext.contractDefinition.txId} -> ${currentTx.id}] threw exception:`,
        `${result.errorMessage}`
      );
    }
    if (result.type === 'error') {
      this.logger.warn(
        `Executing of interaction: [${executionContext.contractDefinition.txId} -> ${currentTx.id}] returned error:`,
        result.errorMessage
      );
    }
  }

  private parseInput(inputTag: GQLTagInterface): unknown | null {
    try {
      return JSON.parse(inputTag.value);
    } catch (e) {
      this.logger.error(e);
      return null;
    }
  }

  abstract latestAvailableState<State>(
    contractTxId: string,
    sortKey?: string
  ): Promise<SortKeyCacheResult<EvalStateResult<State>> | null>;

  abstract onContractCall<State>(
    transaction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>
  ): Promise<void>;

  abstract onInternalWriteStateUpdate<State>(
    transaction: GQLNodeInterface,
    contractTxId: string,
    state: EvalStateResult<State>
  ): Promise<void>;

  abstract onStateEvaluated<State>(
    transaction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>
  ): Promise<void>;

  abstract onStateUpdate<State>(
    transaction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>,
    force?: boolean
  ): Promise<void>;

  abstract putInCache<State>(
    contractTxId: string,
    dry: boolean,
    state: EvalStateResult<State>,
    sortKey: string
  ): Promise<void>;

  abstract syncState<State>(
    contractTxId: string,
    sortKey: string,
    state: State,
    validity: Record<string, boolean>
  ): Promise<SortKeyCacheResult<EvalStateResult<State>>>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  abstract dumpCache(): Promise<any>;

  abstract internalWriteState<State>(
    contractTxId: string,
    sortKey: string
  ): Promise<SortKeyCacheResult<EvalStateResult<State>> | null>;

  abstract hasContractCached(contractTxId: string): Promise<boolean>;

  abstract lastCachedSortKey(): Promise<string | null>;

  abstract setCache(cache: BasicSortKeyCache<EvalStateResult<unknown>>): void;

  abstract getCache(): BasicSortKeyCache<EvalStateResult<unknown>>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function canBeCached(tx: GQLNodeInterface): boolean {
  // in case of using non-redstone gateway
  // if (tx.confirmationStatus === undefined) {
  //   return true;
  // } else {
  //   return tx.confirmationStatus === 'confirmed';
  // }
  // to make sure all contracts are evaluated the same way
  // until we come up with something better
  return true;
}
