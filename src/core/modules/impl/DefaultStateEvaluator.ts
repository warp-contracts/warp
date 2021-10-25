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
  MemCache,
  StateEvaluator,
  TagsParser
} from '@smartweave';
import Arweave from 'arweave';

// FIXME: currently this is tightly coupled with the HandlerApi
export class DefaultStateEvaluator implements StateEvaluator {
  private readonly logger = LoggerFactory.INST.create('DefaultStateEvaluator');

  private readonly transactionStateCache: MemCache<EvalStateResult<unknown>> = new MemCache();

  private readonly tagsParser = new TagsParser();

  constructor(
    private readonly arweave: Arweave,
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
    const { ignoreExceptions, stackTrace } = executionContext.evaluationOptions;
    const { contract, contractDefinition, sortedInteractions } = executionContext;

    let currentState = baseState.state;
    let validity = deepCopy(baseState.validity);

    this.logger.info(
      `Evaluating state for ${executionContext.contractDefinition.txId} [${missingInteractions.length} non-cached of ${executionContext.sortedInteractions.length} all]`
    );

    this.logger.debug('Base state:', baseState.state);

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

      const state = await this.onNextIteration(interactionTx, executionContext);
      const isInteractWrite = this.tagsParser.isInteractWrite(missingInteraction, contractDefinition.txId);

      this.logger.debug('interactWrite?:', isInteractWrite);

      if (isInteractWrite) {
        const writingContractTxId = this.tagsParser.getContractTag(missingInteraction);
        this.logger.debug('Loading writing contract', writingContractTxId);

        const interactionCall: InteractionCall = contract
          .getCallStack()
          .addInteractionData({ interaction: null, interactionTx, currentTx });

        const writingContract = executionContext.smartweave
          .contract(writingContractTxId, executionContext.contract, interactionTx)
          .setEvaluationOptions(executionContext.evaluationOptions);

        this.logger.debug('Reading state of the calling contract', interactionTx.block.height);
        await writingContract.readState(interactionTx.block.height, [
          ...(currentTx || []),
          {
            contractTxId: contractDefinition.txId, //not: writingContractTxId!
            interactionTxId: missingInteraction.node.id
          }
        ]);

        const newState = await this.latestAvailableState(contractDefinition.txId, interactionTx.block.height);
        this.logger.debug('New state:', {
          height: interactionTx.block.height,
          newState,
          txId: contractDefinition.txId
        });

        if (newState !== null) {
          currentState = deepCopy(newState.cachedValue.state);
          validity[interactionTx.id] = newState.cachedValue.validity[interactionTx.id];
        }
        lastEvaluatedInteraction = interactionTx;
        this.logger.debug('New state after internal write', { contractTxId: contractDefinition.txId, newState });
      } else {
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

        let intermediaryCacheHit = false;

        const interactionData = {
          interaction,
          interactionTx,
          currentTx
        };

        this.logger.debug('Interaction:', interaction);

        const interactionCall: InteractionCall = contract.getCallStack().addInteractionData(interactionData);

        if (state !== null) {
          this.logger.debug('Found in intermediary cache');
          intermediaryCacheHit = true;
          currentState = state.state;
          validity = state.validity;
        } else {
          const result = await executionContext.handler.handle(
            executionContext,
            new EvalStateResult(currentState, validity),
            interactionData
          );
          errorMessage = result.errorMessage;

          this.logResult<State>(result, interactionTx, executionContext);

          if (result.type === 'exception' && ignoreExceptions !== true) {
            throw new Error(`Exception while processing ${JSON.stringify(interaction)}:\n${result.result}`);
          }

          validity[interactionTx.id] = result.type === 'ok';
          // strangely - state is for some reason modified for some contracts (eg. YLVpmhSq5JmLltfg6R-5fL04rIRPrlSU22f6RQ6VyYE)
          // when calling any async (even simple timeout) function here...
          // that's (ie. deepCopy) a dumb workaround for this issue
          // see https://github.com/ArweaveTeam/SmartWeave/pull/92 for more details
          currentState = deepCopy(result.state);

          // cannot simply take last element of the missingInteractions
          // as there is no certainty that it has been evaluated (e.g. issues with input tag).
          lastEvaluatedInteraction = interactionTx;

          this.logger.debug('Interaction evaluation', singleInteractionBenchmark.elapsed());
        }

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
    this.logger.debug('State evaluation total:', stateEvaluationBenchmark.elapsed());
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

  async onStateUpdate<State>(
    currentInteraction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>
  ) {
    if (executionContext.evaluationOptions.fcpOptimization && !currentInteraction.dry) {
      this.transactionStateCache.put(
        `${executionContext.contractDefinition.txId}|${currentInteraction.id}`,
        deepCopy(state)
      );
    }
  }

  async onNextIteration<State>(
    currentInteraction: GQLNodeInterface,
    executionContext: ExecutionContext<State>
  ): Promise<EvalStateResult<State>> {
    const cacheKey = `${executionContext.contractDefinition.txId}|${currentInteraction.id}`;
    const cachedState = this.transactionStateCache.get(cacheKey);

    if (cachedState == null) {
      return null;
    } else {
      return deepCopy(cachedState as EvalStateResult<State>);
    }
  }

  onContractCall<State>(
    currentInteraction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>
  ): Promise<void> {
    return Promise.resolve(undefined);
  }

  onStateEvaluated<State>(
    lastInteraction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>
  ): Promise<void> {
    return Promise.resolve(undefined);
  }

  async latestAvailableState<State>(
    contractTxId: string,
    blockHeight: number
  ): Promise<BlockHeightCacheResult<EvalStateResult<State>> | null> {
    return null;
  }

  onInternalWriteStateUpdate<State>(
    currentInteraction: GQLNodeInterface,
    contractTxId: string,
    state: EvalStateResult<State>
  ): Promise<void> {
    return Promise.resolve(undefined);
  }
}
