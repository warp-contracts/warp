import {
  Benchmark,
  canBeCached,
  ContractInteraction,
  CurrentTx,
  EvalStateResult,
  ExecutionContext,
  ExecutionContextModifier,
  GQLNodeInterface,
  GQLTagInterface,
  HandlerApi,
  indent,
  InteractionCall,
  InteractionResult,
  LoggerFactory,
  SortKeyCacheResult,
  StateEvaluator,
  TagsParser,
  VrfData
} from '@warp';
import Arweave from 'arweave';

import { ProofHoHash } from '@idena/vrf-js';
import elliptic from 'elliptic';

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
  ): Promise<EvalStateResult<State>> {
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
  ): Promise<EvalStateResult<State>> {
    const { ignoreExceptions, stackTrace, internalWrites } = executionContext.evaluationOptions;
    const { contract, contractDefinition, sortedInteractions } = executionContext;

    let currentState = baseState.state;
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

    for (let i = 0; i < missingInteractionsLength; i++) {
      const missingInteraction = missingInteractions[i];
      const singleInteractionBenchmark = Benchmark.measure();

      if (missingInteraction.vrf) {
        if (!this.verifyVrf(missingInteraction.vrf, missingInteraction.sortKey, this.arweave)) {
          throw new Error('Vrf verification failed.');
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
        const writingContract = executionContext.warp.contract(
          writingContractTxId,
          executionContext.contract,
          missingInteraction
        );

        await this.onContractCall(
          missingInteraction,
          executionContext,
          new EvalStateResult<State>(currentState, validity, errorMessages)
        );

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

        // loading latest state of THIS contract from cache
        const newState = await this.internalWriteState<State>(contractDefinition.txId, missingInteraction.sortKey);
        if (newState !== null) {
          currentState = newState.cachedValue.state;
          // we need to update the state in the wasm module
          executionContext?.handler.initState(currentState);

          validity[missingInteraction.id] = newState.cachedValue.validity[missingInteraction.id];
          if (newState.cachedValue.errorMessages?.[missingInteraction.id]) {
            errorMessages[missingInteraction.id] = newState.cachedValue.errorMessages[missingInteraction.id];
          }

          const toCache = new EvalStateResult(currentState, validity, errorMessages);
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

        this.logger.debug(`${indent(depth)}Interaction:`, interaction);

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

    return evalStateResult;
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
}
