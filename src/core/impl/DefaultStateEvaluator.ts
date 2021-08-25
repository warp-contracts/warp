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
  HandlerResult,
  LoggerFactory,
  SmartWeaveTags,
  StateEvaluator
} from '@smartweave';
import Arweave from 'arweave';

const logger = LoggerFactory.INST.create(__filename);

// FIXME: currently this is tightly coupled with the HandlerApi
export class DefaultStateEvaluator<State = unknown> implements StateEvaluator<State, HandlerApi<State>> {
  constructor(
    private readonly arweave: Arweave,
    private readonly executionContextModifiers: ExecutionContextModifier<State>[] = []
  ) {}

  async eval(
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

  protected async doReadState(
    missingInteractions: GQLEdgeInterface[],
    baseState: EvalStateResult<State>,
    executionContext: ExecutionContext<State, HandlerApi<State>>,
    currentTx: { interactionTxId: string; contractTxId: string }[]
  ): Promise<EvalStateResult<State>> {
    const evaluationOptions = executionContext.evaluationOptions;

    let currentState = baseState.state;
    const validity = JSON.parse(JSON.stringify(baseState.validity));

    logger.info(
      `Evaluating state for ${executionContext.contractDefinition.txId} [${missingInteractions.length} non-cached of ${executionContext.sortedInteractions.length} all]`
    );

    for (const missingInteraction of missingInteractions) {
      logger.debug(
        `${missingInteraction.node.id}: ${missingInteractions.indexOf(missingInteraction) + 1}/${
          missingInteractions.length
        } [of all:${executionContext.sortedInteractions.length}]`
      );
      const benchmark = Benchmark.measure();
      const currentInteraction: GQLNodeInterface = missingInteraction.node;

      const inputTag = this.findInputTag(missingInteraction, executionContext);
      if (!inputTag || inputTag.name !== SmartWeaveTags.INPUT) {
        logger.error(`Skipping tx with missing or invalid Input tag - ${currentInteraction.id}`);
        continue;
      }

      const input = this.parseInput(inputTag);
      if (!input) {
        logger.error(`Skipping tx with missing or invalid Input tag - ${currentInteraction.id}`);
        continue;
      }

      const interaction: ContractInteraction = {
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

      this.logResult(result, currentInteraction);

      if (result.type === 'exception' && evaluationOptions.ignoreExceptions !== true) {
        throw new Error(`Exception while processing ${JSON.stringify(interaction)}:\n${result.result}`);
      }

      validity[currentInteraction.id] = result.type === 'ok';
      currentState = result.state;
      logger.debug(`${missingInteraction.node.id} evaluation`, benchmark.elapsed());

      // I'm really NOT a fan of this "modify" feature, but I don't have idea how to better
      // implement the "evolve" feature
      for (const { modify } of this.executionContextModifiers) {
        executionContext = await modify(currentState, executionContext);
      }

      this.onStateUpdate(currentInteraction, executionContext, new EvalStateResult(currentState, validity));
    }

    return new EvalStateResult<State>(currentState, validity);
  }

  private logResult(
    result: HandlerResult<State> & { type: 'ok' | 'error' | 'exception' },
    currentTx: GQLNodeInterface
  ) {
    if (result.type === 'exception') {
      logger.error(`${result.result}`);
      logger.error(`Executing of interaction: ${currentTx.id} threw exception.`);
    }
    if (result.type === 'error') {
      logger.error(`${result.result}`);
      logger.error(`Executing of interaction: ${currentTx.id} returned error.`);
    }
  }

  private parseInput(inputTag: GQLTagInterface): unknown | null {
    try {
      return JSON.parse(inputTag.value);
    } catch (e) {
      logger.error(e);
      return null;
    }
  }

  private findInputTag(
    missingInteraction: GQLEdgeInterface,
    executionContext: ExecutionContext<State, HandlerApi<State>>
  ): GQLTagInterface {
    const contractIndex = missingInteraction.node.tags.findIndex(
      (tag) => tag.name === SmartWeaveTags.CONTRACT_TX_ID && tag.value === executionContext.contractDefinition.txId
    );

    return missingInteraction.node.tags[contractIndex + 1];
  }

  onStateUpdate(
    currentInteraction: GQLNodeInterface,
    executionContext: ExecutionContext<State, HandlerApi<State>>,
    state: EvalStateResult<State>
  ) {
    // noop
  }
}
