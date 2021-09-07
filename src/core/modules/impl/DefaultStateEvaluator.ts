import {
  Benchmark,
  ContractInteraction,
  EvalStateResult,
  ExecutionContext,
  ExecutionContextModifier,
  GQLEdgeInterface,
  GQLNodeInterface,
  GQLTagInterface,
  HandlerApi,
  InteractionResult,
  LoggerFactory,
  SmartWeaveTags,
  StateEvaluator
} from '@smartweave';
import Arweave from 'arweave';

// FIXME: currently this is tightly coupled with the HandlerApi
export class DefaultStateEvaluator implements StateEvaluator {
  private readonly logger = LoggerFactory.INST.create('DefaultStateEvaluator');

  constructor(
    private readonly arweave: Arweave,
    private readonly executionContextModifiers: ExecutionContextModifier[] = []
  ) {}

  async eval<State>(
    executionContext: ExecutionContext<State, HandlerApi<State>>,
    currentTx: { interactionTxId: string; contractTxId: string }[]
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
    currentTx: { interactionTxId: string; contractTxId: string }[]
  ): Promise<EvalStateResult<State>> {
    const stateEvaluationBenchmark = Benchmark.measure();
    const evaluationOptions = executionContext.evaluationOptions;

    let currentState = baseState.state;
    const validity = JSON.parse(JSON.stringify(baseState.validity));

    this.logger.info(
      `Evaluating state for ${executionContext.contractDefinition.txId} [${missingInteractions.length} non-cached of ${executionContext.sortedInteractions.length} all]`
    );

    this.logger.trace(
      'missingInteractions',
      missingInteractions.map((int) => {
        return int.node.id;
      })
    );

    this.logger.trace('Init state', JSON.stringify(baseState.state));

    for (const missingInteraction of missingInteractions) {
      this.logger.debug(
        `${missingInteraction.node.id}: ${missingInteractions.indexOf(missingInteraction) + 1}/${
          missingInteractions.length
        } [of all:${executionContext.sortedInteractions.length}]`
      );
      const singleInteractionBenchmark = Benchmark.measure();
      const currentInteraction: GQLNodeInterface = missingInteraction.node;

      const inputTag = this.findInputTag(missingInteraction, executionContext);
      if (!inputTag || inputTag.name !== SmartWeaveTags.INPUT) {
        this.logger.error(`Skipping tx with missing or invalid Input tag - ${currentInteraction.id}`);
        continue;
      }

      const input = this.parseInput(inputTag);
      if (!input) {
        this.logger.error(`Skipping tx with missing or invalid Input tag - ${currentInteraction.id}`);
        continue;
      }

      const interaction: ContractInteraction<unknown> = {
        input,
        caller: currentInteraction.owner.address
      };

      const result = await executionContext.handler.handle(
        executionContext,
        currentState,
        interaction,
        currentInteraction,
        currentTx
      );

      this.logResult<State>(result, currentInteraction);

      if (result.type === 'exception' && evaluationOptions.ignoreExceptions !== true) {
        throw new Error(`Exception while processing ${JSON.stringify(interaction)}:\n${result.result}`);
      }

      validity[currentInteraction.id] = result.type === 'ok';

      currentState = result.state;

      // I'm really NOT a fan of this "modify" feature, but I don't have idea how to better
      // implement the "evolve" feature
      for (const { modify } of this.executionContextModifiers) {
        // strangely - state is for some reason modified for some contracts (eg. YLVpmhSq5JmLltfg6R-5fL04rIRPrlSU22f6RQ6VyYE)
        // when calling any async (even simple timeout) function here...
        // that's a dumb workaround for this issue
        const stateCopy = JSON.parse(JSON.stringify(currentState));
        executionContext = await modify<State>(currentState, executionContext);
        currentState = stateCopy;
      }
      this.logger.debug('Interaction evaluation', singleInteractionBenchmark.elapsed());

      await this.onStateUpdate<State>(
        currentInteraction,
        executionContext,
        new EvalStateResult(currentState, validity)
      );
    }
    this.logger.debug('State evaluation total:', stateEvaluationBenchmark.elapsed());
    return new EvalStateResult<State>(currentState, validity);
  }

  private logResult<State>(result: InteractionResult<State, unknown>, currentTx: GQLNodeInterface) {
    if (result.type === 'exception') {
      this.logger.error(`Executing of interaction: ${currentTx.id} threw exception:`, `${result.errorMessage}`);
    }
    if (result.type === 'error') {
      this.logger.warn(`Executing of interaction: ${currentTx.id} returned error:`, result.errorMessage);
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

  private findInputTag<State>(
    missingInteraction: GQLEdgeInterface,
    executionContext: ExecutionContext<State, unknown>
  ): GQLTagInterface {
    const contractIndex = missingInteraction.node.tags.findIndex(
      (tag) => tag.name === SmartWeaveTags.CONTRACT_TX_ID && tag.value === executionContext.contractDefinition.txId
    );

    return missingInteraction.node.tags[contractIndex + 1];
  }

  async onStateUpdate<State>(
    currentInteraction: GQLNodeInterface,
    executionContext: ExecutionContext<State, unknown>,
    state: EvalStateResult<State>
  ) {
    // noop
  }
}
