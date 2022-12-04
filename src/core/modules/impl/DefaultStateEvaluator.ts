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
import { indent } from '../../../utils/utils';
import { EvalStateResult, StateEvaluator } from '../StateEvaluator';
import { ContractInteraction, HandlerApi, InteractionResult } from './HandlerExecutorFactory';
import { isConfirmedInteraction } from './StateCache';
import { TagsParser } from './TagsParser';
import {EvaluationProgressInput} from "../../WarpPlugin";

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
    interactions: GQLNodeInterface[],
    baseState: EvalStateResult<State>,
    executionContext: ExecutionContext<State, HandlerApi<State>>,
    currentTx: CurrentTx[]
  ): Promise<SortKeyCacheResult<EvalStateResult<State>>> {
    const { ignoreExceptions, stackTrace, internalWrites, cacheEveryNInteractions } =
      executionContext.evaluationOptions;
    const { contract, contractDefinition, sortedInteractions, warp, handler } = executionContext;

    let currentState = baseState.state;
    let currentSortKey = null;
    const validity = baseState.validity;
    const errorMessages = baseState.errorMessages;

    executionContext?.handler.initState(currentState);

    const depth = executionContext.contract.callDepth();

    this.logger.info(
      `${indent(depth)}Evaluating state for ${contractDefinition.txId} [${interactions.length} non-cached of ${
        sortedInteractions.length
      } all]`
    );

    let errorMessage = null;
    //let lastConfirmedTxState: { tx: GQLNodeInterface; state: EvalStateResult<State> } = null;
    let lastConfirmedTx: GQLNodeInterface = null;
    let lastConfirmedState: EvalStateResult<State> = null;
    const interactionsLength = interactions.length;

    const evmSignatureVerificationPlugin = warp.hasPlugin('evm-signature-verification')
      ? warp.loadPlugin<GQLNodeInterface, Promise<boolean>>('evm-signature-verification')
      : null;

    const progressPlugin = warp.hasPlugin('evaluation-progress')
      ? warp.loadPlugin<EvaluationProgressInput, void>('evaluation-progress')
      : null;


    for (let i = interactionsLength - 1; i >= 0; i--) {
      if (isConfirmedInteraction(interactions[i])) {
        lastConfirmedTx = interactions[i];
        break;
      }
    }

    for (let i = 0; i < interactionsLength; i++) {
      const interaction = interactions[i];
      const singleInteractionBenchmark = Benchmark.measure();
      currentSortKey = interaction.sortKey;

      if (interaction.vrf) {
        if (!this.verifyVrf(interaction.vrf, interaction.sortKey, this.arweave)) {
          throw new Error('Vrf verification failed.');
        }
      }

      if (evmSignatureVerificationPlugin && this.tagsParser.isEvmSigned(interaction)) {
        try {
          if (!(await evmSignatureVerificationPlugin.process(interaction))) {
            this.logger.warn(`Interaction ${interaction.id} was not verified, skipping.`);
            continue;
          }
        } catch (e) {
          this.logger.error(e);
          continue;
        }
      }

      this.logger.debug(
        `${indent(depth)}[${contractDefinition.txId}][${interaction.id}][${interaction.block.height}]: ${
          interactions.indexOf(interaction) + 1
        }/${interactions.length} [of all:${sortedInteractions.length}]`
      );

      const isInteractWrite = this.tagsParser.isInteractWrite(interaction, contractDefinition.txId);

      // other contract makes write ("writing contract") on THIS contract
      if (isInteractWrite && internalWrites) {
        // evaluating txId of the contract that is writing on THIS contract
        const writingContractTxId = this.tagsParser.getContractTag(interaction);
        this.logger.debug(`${indent(depth)}Internal Write - Loading writing contract`, writingContractTxId);

        const interactionCall: InteractionCall = contract
          .getCallStack()
          .addInteractionData({ action: null, interaction: interaction, currentTx });

        // creating a Contract instance for the "writing" contract
        const writingContract = executionContext.warp.contract(writingContractTxId, executionContext.contract, {
          callingInteraction: interaction,
          callType: 'read'
        });

        await this.onContractCall(
          interaction,
          executionContext,
          new EvalStateResult<State>(currentState, validity, errorMessages)
        );

        this.logger.debug(`${indent(depth)}Reading state of the calling contract at`, interaction.sortKey);
        /**
         Reading the state of the writing contract.
         This in turn will cause the state of THIS contract to be
         updated in cache - see {@link ContractHandlerApi.assignWrite}
         */
        await writingContract.readState(interaction.sortKey, [
          ...(currentTx || []),
          {
            contractTxId: contractDefinition.txId, //not: writingContractTxId!
            interactionTxId: interaction.id
          }
        ]);

        // loading latest state of THIS contract from cache
        const newState = await this.internalWriteState<State>(contractDefinition.txId, interaction.sortKey);
        if (newState !== null) {
          currentState = newState.cachedValue.state;
          // we need to update the state in the wasm module
          executionContext?.handler.initState(currentState);

          validity[interaction.id] = newState.cachedValue.validity[interaction.id];
          if (newState.cachedValue.errorMessages?.[interaction.id]) {
            errorMessages[interaction.id] = newState.cachedValue.errorMessages[interaction.id];
          }

          const toCache = new EvalStateResult(currentState, validity, errorMessages);
          await this.onStateUpdate<State>(interaction, executionContext, toCache);
          if (interaction.id == lastConfirmedTx.id) {
            lastConfirmedState = toCache;
          }
        } else {
          validity[interaction.id] = false;
        }

        interactionCall.update({
          cacheHit: false,
          executionTime: singleInteractionBenchmark.elapsed(true) as number,
          valid: validity[interaction.id],
          errorMessage: errorMessage,
          gasUsed: 0 // TODO...
        });
      } else {
        // "direct" interaction with this contract - "standard" processing
        const inputTag = this.tagsParser.getInputTag(interaction, contractDefinition.txId);
        if (!inputTag) {
          this.logger.error(`${indent(depth)}Skipping tx - Input tag not found for ${interaction.id}`);
          continue;
        }
        const input = this.parseInput(inputTag);
        if (!input) {
          this.logger.error(`${indent(depth)}Skipping tx - invalid Input tag - ${interaction.id}`);
          continue;
        }

        const action: ContractInteraction<unknown> = {
          input,
          caller: interaction.owner.address
        };

        const interactionData = { action, interaction, currentTx };
        const interactionCall: InteractionCall = contract.getCallStack().addInteractionData(interactionData);

        const result = await handler.handle(executionContext, new EvalStateResult(currentState, validity, errorMessages), interactionData);
        errorMessage = result.errorMessage;
        if (result.type !== 'ok') {
          errorMessages[interaction.id] = errorMessage;
        }

        this.logResult<State>(result, interaction, executionContext);

        this.logger.debug(`${indent(depth)}Interaction evaluation`, singleInteractionBenchmark.elapsed());

        interactionCall.update({
          cacheHit: false,
          executionTime: singleInteractionBenchmark.elapsed(true) as number,
          valid: validity[interaction.id],
          errorMessage: errorMessage,
          gasUsed: result.gasUsed
        });

        if (result.type === 'exception' && ignoreExceptions !== true) {
          throw new Error(`Exception while processing ${JSON.stringify(action)}:\n${result.errorMessage}`);
        }

        validity[interaction.id] = result.type === 'ok';

        if (result.state) {
          currentState = result.state;

          const toCache = new EvalStateResult(currentState, validity, errorMessages);
          if (interaction.id == lastConfirmedTx.id) {
            lastConfirmedState = toCache;
          }
          await this.onStateUpdate<State>(
            interaction,
            executionContext,
            toCache,
            cacheEveryNInteractions % i == 0 //TODO: will not work for WASM
          );
        } else {
          currentState = null;
          if (interaction.id == lastConfirmedTx.id) {
            const toCache = new EvalStateResult(handler.currentState(), validity, errorMessages);
            lastConfirmedState = toCache;
          }
        }
      }

      if (progressPlugin) {
        progressPlugin.process({
          contractTxId: contractDefinition.txId,
          allInteractions: interactionsLength,
          currentInteraction: i,
          lastInteractionProcessingTime: singleInteractionBenchmark.elapsed() as string
        });
      }

      // TODO: this obviously not work with the current state opt for WASM
      for (const { modify } of this.executionContextModifiers) {
        executionContext = await modify<State>(currentState, executionContext);
      }
    }
    const evalStateResult = new EvalStateResult<State>(currentState, validity, errorMessages);

    // state could have been fully retrieved from cache
    // or there were no interactions below requested block height
    // or all interaction used for evaluation were not confirmed
    if (lastConfirmedTx !== null && lastConfirmedState !== null) {
      await this.onStateEvaluated(lastConfirmedTx, executionContext, lastConfirmedState);
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
