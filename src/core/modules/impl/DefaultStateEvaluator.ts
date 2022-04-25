import {
  Benchmark,
  BlockHeightCacheResult,
  canBeCached,
  ContractInteraction,
  CurrentTx,
  EvalStateResult,
  ExecutionContext,
  ExecutionContextModifier,
  GQLEdgeInterface,
  GQLNodeInterface,
  GQLTagInterface,
  HandlerApi,
  InteractionCall,
  InteractionResult,
  LoggerFactory,
  StateEvaluator,
  TagsParser
} from '@smartweave';
import Arweave from 'arweave';

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
      new EvalStateResult<State>(executionContext.contractDefinition.initState, {}),
      executionContext,
      currentTx
    );
  }

  protected async doReadState<State>(
    missingInteractions: GQLEdgeInterface[],
    baseState: EvalStateResult<State>,
    executionContext: ExecutionContext<State, HandlerApi<State>>,
    currentTx: CurrentTx[]
  ): Promise<EvalStateResult<State>> {
    const { ignoreExceptions, stackTrace, internalWrites } = executionContext.evaluationOptions;
    const { contract, contractDefinition, sortedInteractions } = executionContext;

    let currentState = baseState.state;
    const validity = baseState.validity;

    executionContext?.handler.initState(currentState);

    this.logger.info(
      `Evaluating state for ${contractDefinition.txId} [${missingInteractions.length} non-cached of ${sortedInteractions.length} all]`
    );

    let errorMessage = null;
    let lastConfirmedTxState: { tx: GQLNodeInterface; state: EvalStateResult<State> } = null;

    const missingInteractionsLength = missingInteractions.length;
    executionContext.handler.initState(currentState);

    for (let i = 0; i < missingInteractionsLength; i++) {
      const missingInteraction = missingInteractions[i];
      const singleInteractionBenchmark = Benchmark.measure();

      const interactionTx: GQLNodeInterface = missingInteraction.node;

      this.logger.debug(
        `[${contractDefinition.txId}][${missingInteraction.node.id}][${missingInteraction.node.block.height}]: ${
          missingInteractions.indexOf(missingInteraction) + 1
        }/${missingInteractions.length} [of all:${sortedInteractions.length}]`
      );

      const isInteractWrite = this.tagsParser.isInteractWrite(missingInteraction, contractDefinition.txId);

      // other contract makes write ("writing contract") on THIS contract
      if (isInteractWrite && internalWrites) {
        // evaluating txId of the contract that is writing on THIS contract
        const writingContractTxId = this.tagsParser.getContractTag(missingInteraction);
        this.logger.debug('Loading writing contract', writingContractTxId);

        const interactionCall: InteractionCall = contract
          .getCallStack()
          .addInteractionData({ interaction: null, interactionTx, currentTx });

        // creating a Contract instance for the "writing" contract
        const writingContract = executionContext.smartweave.contract(
          writingContractTxId,
          executionContext.contract,
          interactionTx
        );

        this.logger.debug('Reading state of the calling contract', interactionTx.block.height);

        /**
         Reading the state of the writing contract.
         This in turn will cause the state of THIS contract to be
         updated in cache - see {@link ContractHandlerApi.assignWrite}
         */
        await writingContract.readState(interactionTx.block.height, [
          ...(currentTx || []),
          {
            contractTxId: contractDefinition.txId, //not: writingContractTxId!
            interactionTxId: missingInteraction.node.id
          }
        ]);

        // loading latest state of THIS contract from cache
        const newState = await this.latestAvailableState<State>(contractDefinition.txId, interactionTx.block.height);
        this.logger.debug('New state:', {
          height: interactionTx.block.height,
          newState,
          txId: contractDefinition.txId
        });

        if (newState !== null) {
          currentState = newState.cachedValue.state;
          // we need to update the state in the wasm module
          executionContext?.handler.initState(currentState);
          validity[interactionTx.id] = newState.cachedValue.validity[interactionTx.id];

          const toCache = new EvalStateResult(currentState, validity);

          // TODO: probably a separate hook should be created here
          // to fix https://github.com/redstone-finance/redstone-smartcontracts/issues/109
          await this.onStateUpdate<State>(interactionTx, executionContext, toCache);
          if (canBeCached(interactionTx)) {
            lastConfirmedTxState = {
              tx: interactionTx,
              state: toCache
            };
          }
        } else {
          validity[interactionTx.id] = false;
        }

        interactionCall.update({
          cacheHit: false,
          intermediaryCacheHit: false,
          outputState: stackTrace.saveState ? currentState : undefined,
          executionTime: singleInteractionBenchmark.elapsed(true) as number,
          valid: validity[interactionTx.id],
          errorMessage: errorMessage,
          gasUsed: 0 // TODO...
        });

        this.logger.debug('New state after internal write', { contractTxId: contractDefinition.txId, newState });
      } else {
        // "direct" interaction with this contract - "standard" processing
        const inputTag = this.tagsParser.getInputTag(missingInteraction, executionContext.contractDefinition.txId);
        if (!inputTag) {
          this.logger.error(`Skipping tx - Input tag not found for ${interactionTx.id}`);
          continue;
        }
        const input = this.parseInput(inputTag);
        if (!input) {
          this.logger.error(`Skipping tx - invalid Input tag - ${interactionTx.id}`);
          continue;
        }

        const interaction: ContractInteraction<unknown> = {
          input,
          caller: interactionTx.owner.address
        };

        const interactionData = {
          interaction,
          interactionTx,
          currentTx
        };

        this.logger.debug('Interaction:', interaction);

        const interactionCall: InteractionCall = contract.getCallStack().addInteractionData(interactionData);

        const result = await executionContext.handler.handle(
          executionContext,
          new EvalStateResult(currentState, validity),
          interactionData
        );
        errorMessage = result.errorMessage;

        this.logResult<State>(result, interactionTx, executionContext);

        this.logger.debug('Interaction evaluation', singleInteractionBenchmark.elapsed());

        interactionCall.update({
          cacheHit: false,
          intermediaryCacheHit: false,
          outputState: stackTrace.saveState ? currentState : undefined,
          executionTime: singleInteractionBenchmark.elapsed(true) as number,
          valid: validity[interactionTx.id],
          errorMessage: errorMessage,
          gasUsed: result.gasUsed
        });

        if (result.type === 'exception' && ignoreExceptions !== true) {
          throw new Error(`Exception while processing ${JSON.stringify(interaction)}:\n${result.errorMessage}`);
        }

        validity[interactionTx.id] = result.type === 'ok';
        currentState = result.state;

        const toCache = new EvalStateResult(currentState, validity);
        if (canBeCached(interactionTx)) {
          lastConfirmedTxState = {
            tx: interactionTx,
            state: toCache
          };
        }
        await this.onStateUpdate<State>(interactionTx, executionContext, toCache);
      }

      // I'm really NOT a fan of this "modify" feature, but I don't have idea how to better
      // implement the "evolve" feature
      for (const { modify } of this.executionContextModifiers) {
        executionContext = await modify<State>(currentState, executionContext);
      }
    }
    //this.logger.info('State evaluation total:', stateEvaluationBenchmark.elapsed());
    const evalStateResult = new EvalStateResult<State>(currentState, validity);

    // state could have been fully retrieved from cache
    // or there were no interactions below requested block height
    if (lastConfirmedTxState !== null) {
      await this.onStateEvaluated(lastConfirmedTxState.tx, executionContext, lastConfirmedTxState.state);
    }

    return evalStateResult;
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
    blockHeight: number
  ): Promise<BlockHeightCacheResult<EvalStateResult<State>> | null>;

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
    state: EvalStateResult<State>
  ): Promise<void>;

  abstract flushCache(): Promise<void>;

  abstract syncState(
    contractTxId: string,
    blockHeight: number,
    transactionId: string,
    state: any,
    validity: any
  ): Promise<void>;
}
