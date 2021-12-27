import {
  Benchmark,
  BlockHeightCacheResult,
  ContractInteraction,
  CurrentTx,
  deepCopy,
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
    const stateEvaluationBenchmark = Benchmark.measure();
    const { ignoreExceptions, stackTrace, internalWrites } = executionContext.evaluationOptions;
    const { contract, contractDefinition, sortedInteractions } = executionContext;

    let currentState = baseState.state;
    const validity = baseState.validity;

    this.logger.info(
      `Evaluating state for ${contractDefinition.txId} [${missingInteractions.length} non-cached of ${sortedInteractions.length} all]`
    );

    this.logger.trace('Base state:', baseState.state);

    let lastEvaluatedInteraction = null;
    let errorMessage = null;

    for (const missingInteraction of missingInteractions) {
      const singleInteractionBenchmark = Benchmark.measure();

      const interactionTx: GQLNodeInterface = missingInteraction.node;

      this.logger.debug(
        `[${contractDefinition.txId}][${missingInteraction.node.id}][${missingInteraction.node.block.height}]: ${
          missingInteractions.indexOf(missingInteraction) + 1
        }/${missingInteractions.length} [of all:${sortedInteractions.length}]`
      );

      // verifying whether state isn't already available for this exact interaction.
      const isInteractWrite = this.tagsParser.isInteractWrite(missingInteraction, contractDefinition.txId);

      this.logger.debug('interactWrite?:', isInteractWrite);

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
          currentState = deepCopy(newState.cachedValue.state);
          validity[interactionTx.id] = newState.cachedValue.validity[interactionTx.id];
          await this.onStateUpdate<State>(interactionTx, executionContext, new EvalStateResult(currentState, validity));
          lastEvaluatedInteraction = interactionTx;
        } else {
          validity[interactionTx.id] = false;
        }

        interactionCall.update({
          cacheHit: false,
          intermediaryCacheHit: false,
          outputState: stackTrace.saveState ? currentState : undefined,
          executionTime: singleInteractionBenchmark.elapsed(true) as number,
          valid: validity[interactionTx.id],
          errorMessage: errorMessage
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

        const intermediaryCacheHit = false;

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

        if (result.type === 'exception' && ignoreExceptions !== true) {
          throw new Error(`Exception while processing ${JSON.stringify(interaction)}:\n${result.errorMessage}`);
        }

        validity[interactionTx.id] = result.type === 'ok';
        currentState = result.state;

        // cannot simply take last element of the missingInteractions
        // as there is no certainty that it has been evaluated (e.g. issues with input tag).
        lastEvaluatedInteraction = interactionTx;

        this.logger.debug('Interaction evaluation', singleInteractionBenchmark.elapsed());

        interactionCall.update({
          cacheHit: false,
          intermediaryCacheHit,
          outputState: stackTrace.saveState ? currentState : undefined,
          executionTime: singleInteractionBenchmark.elapsed(true) as number,
          valid: validity[interactionTx.id],
          errorMessage: errorMessage
        });

        await this.onStateUpdate<State>(interactionTx, executionContext, new EvalStateResult(currentState, validity));
      }

      // I'm really NOT a fan of this "modify" feature, but I don't have idea how to better
      // implement the "evolve" feature
      for (const { modify } of this.executionContextModifiers) {
        executionContext = await modify<State>(currentState, executionContext);
      }
    }
    this.logger.info('State evaluation total:', stateEvaluationBenchmark.elapsed());
    const evalStateResult = new EvalStateResult<State>(currentState, validity);

    // state could have been full retrieved from cache
    // or there were no interactions below requested block height
    if (lastEvaluatedInteraction !== null) {
      await this.onStateEvaluated(lastEvaluatedInteraction, executionContext, evalStateResult);
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
        `Executing of interaction: [${executionContext.contractDefinition.srcTxId} -> ${currentTx.id}] threw exception:`,
        `${result.errorMessage}`
      );
    }
    if (result.type === 'error') {
      this.logger.warn(
        `Executing of interaction: [${executionContext.contractDefinition.srcTxId} -> ${currentTx.id}] returned error:`,
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
}
