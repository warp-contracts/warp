import Arweave from 'arweave';

import { ProofHoHash } from '@idena/vrf-js';
import elliptic from 'elliptic';
import { SortKeyCache, SortKeyCacheResult } from '../../../cache/SortKeyCache';
import { CurrentTx } from '../../../contract/Contract';
import { InteractionCall } from '../../ContractCallRecord';
import { ExecutionContext } from '../../../core/ExecutionContext';
import { ExecutionContextModifier } from '../../../core/ExecutionContextModifier';
import { GQLNodeInterface, GQLTagInterface, VrfData } from '../../../legacy/gqlResult';
import { Benchmark } from '../../../logging/Benchmark';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import {deepCopy, indent} from '../../../utils/utils';
import { EvalStateResult, StateEvaluator } from '../StateEvaluator';
import { ContractInteraction, HandlerApi, InteractionResult } from './HandlerExecutorFactory';
import { canBeCached } from './StateCache';
import { TagsParser } from './TagsParser';

const EC = new elliptic.ec('secp256k1');

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
    executionContext: ExecutionContext<State, HandlerApi<State>>,
    currentTx: CurrentTx[]
  ): Promise<SortKeyCacheResult<EvalStateResult<State>>> {
    return this.doReadState(
      executionContext.sortedInteractions,
      new EvalStateResult<State>(executionContext.contractDefinition.initState, {}, {}),
      executionContext,
      currentTx
    );
  }

  protected async doReadState<State>(
    missingInteractions: GQLNodeInterface[],
    baseState: EvalStateResult<State>,
    executionContext: ExecutionContext<State, HandlerApi<State>>,
    currentTx: CurrentTx[]
  ): Promise<SortKeyCacheResult<EvalStateResult<State>>> {
    const { ignoreExceptions, stackTrace, internalWrites } = executionContext.evaluationOptions;
    const { contract, contractDefinition, sortedInteractions, warp } = executionContext;

    let currentState = baseState.state;
    let currentSortKey = null;
    const validity = baseState.validity;
    const errorMessages = baseState.errorMessages;

    executionContext?.handler.initState(currentState);

    const depth = executionContext.contract.callDepth();

    this.logger.info(
      `${indent(depth)}Evaluating state for ${contractDefinition.txId} [${missingInteractions.length} non-cached of ${
        sortedInteractions.length
      } all]`
    );

    let errorMessage = null;
    let lastConfirmedTxState: { tx: GQLNodeInterface; state: EvalStateResult<State> } = null;

    const missingInteractionsLength = missingInteractions.length;
    executionContext.handler.initState(currentState);

    const evmSignatureVerificationPlugin = warp.hasPlugin('evm-signature-verification')
      ? warp.loadPlugin<GQLNodeInterface, Promise<boolean>>('evm-signature-verification')
      : null;

    for (let i = 0; i < missingInteractionsLength; i++) {
      const missingInteraction = missingInteractions[i];
      //TODO: not sure about setting validity - it should be probably initialized to true for this interaction
      //TODO: WASM will be problematic here...the changes made inside the function in the WASM module
      // won't be immediately reflected here...(as it is a case for js contracts)
      contract.uncommittedState = new EvalStateResult<State>(deepCopy(currentState), validity, errorMessages);
      const singleInteractionBenchmark = Benchmark.measure();
      currentSortKey = missingInteraction.sortKey;

      if (missingInteraction.vrf) {
        if (!this.verifyVrf(missingInteraction.vrf, missingInteraction.sortKey, this.arweave)) {
          throw new Error('Vrf verification failed.');
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
          .addInteractionData({ interaction: null, interactionTx: missingInteraction, currentTx });

        // creating a Contract instance for the "writing" contract
        const writingContract = executionContext.warp.contract(writingContractTxId, executionContext.contract, {
          callingInteraction: missingInteraction,
          callType: 'read'
        });

        // this should be no longer needed with the 'uncommitted' state feature
        /*await this.onContractCall(
          missingInteraction,
          executionContext,
          new EvalStateResult<State>(currentState, validity, errorMessages)
        );*/

        this.logger.debug(`${indent(depth)}Reading state of the calling contract at`, missingInteraction.sortKey);
        /**
         Reading the state of the writing contract.
         This in turn will cause the state of THIS contract to be
         updated in cache - see {@link ContractHandlerApi.assignWrite}
         */
        await writingContract.readState(missingInteraction.sortKey, [
          ...(currentTx || []),
          {
            contractTxId: contractDefinition.txId, //not: writingContractTxId!
            interactionTxId: missingInteraction.id
          }
        ]);

        // note: with this new version - the {@link ContractHandlerApi.assignWrite}
        // should update it's parent contract uncommitted state.
        // TODO: check if it is the exact same state that was set in the assignWrite!!!
        const newState = contract.uncommittedState;
        if (newState.state !== null) {
          // we need to update the state in the wasm module
          executionContext?.handler.initState(newState.state);

          validity[missingInteraction.id] = newState.validity[missingInteraction.id];
          if (newState.errorMessages?.[missingInteraction.id]) {
            errorMessages[missingInteraction.id] = newState.errorMessages[missingInteraction.id];
          }

          const toCache = new EvalStateResult(newState.state, validity, errorMessages);
          await this.onStateUpdate<State>(missingInteraction, executionContext, toCache);
          if (canBeCached(missingInteraction)) {
            lastConfirmedTxState = {
              tx: missingInteraction,
              state: toCache
            };
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
          caller: missingInteraction.owner.address
        };

        const interactionData = {
          interaction,
          interactionTx: missingInteraction,
          currentTx
        };

        const interactionCall: InteractionCall = contract.getCallStack().addInteractionData(interactionData);

        const result = await executionContext.handler.handle(
          executionContext,
          new EvalStateResult(currentState, validity, errorMessages),
          interactionData
        );
        errorMessage = result.errorMessage;
        if (result.type !== 'ok') {
          errorMessages[missingInteraction.id] = errorMessage;
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

        const toCache = new EvalStateResult(currentState, validity, errorMessages);
        if (canBeCached(missingInteraction)) {
          lastConfirmedTxState = {
            tx: missingInteraction,
            state: toCache
          };
        }
        await this.onStateUpdate<State>(missingInteraction, executionContext, toCache);
      }

      for (const { modify } of this.executionContextModifiers) {
        executionContext = await modify<State>(currentState, executionContext);
      }
    }
    const evalStateResult = new EvalStateResult<State>(currentState, validity, errorMessages);

    // state could have been fully retrieved from cache
    // or there were no interactions below requested block height
    if (lastConfirmedTxState !== null) {
      await this.onStateEvaluated(lastConfirmedTxState.tx, executionContext, lastConfirmedTxState.state);
    }

    return new SortKeyCacheResult(currentSortKey, evalStateResult);
  }

  private verifyVrf(vrf: VrfData, sortKey: string, arweave: Arweave): boolean {
    const keys = EC.keyFromPublic(vrf.pubkey, 'hex');

    let hash;
    try {
      // ProofHoHash throws its own 'invalid vrf' exception
      hash = ProofHoHash(
        keys.getPublic(),
        arweave.utils.stringToBuffer(sortKey),
        arweave.utils.b64UrlToBuffer(vrf.proof)
      );
    } catch (e: any) {
      return false;
    }

    return arweave.utils.bufferTob64Url(hash) == vrf.index;
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
    transaction: GQLNodeInterface,
    state: EvalStateResult<State>
  ): Promise<void>;

  abstract syncState(contractTxId: string, sortKey: string, state: any, validity: any): Promise<void>;

  abstract dumpCache(): Promise<any>;

  abstract internalWriteState<State>(
    contractTxId: string,
    sortKey: string
  ): Promise<SortKeyCacheResult<EvalStateResult<State>> | null>;

  abstract hasContractCached(contractTxId: string): Promise<boolean>;

  abstract lastCachedSortKey(): Promise<string | null>;

  abstract allCachedContracts(): Promise<string[]>;

  abstract setCache(cache: SortKeyCache<EvalStateResult<unknown>>): void;

  abstract getCache(): SortKeyCache<EvalStateResult<unknown>>;
}
