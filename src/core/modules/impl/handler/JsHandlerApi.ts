import { ContractDefinition } from '../../../../core/ContractDefinition';
import { ExecutionContext } from '../../../../core/ExecutionContext';
import { EvalStateResult } from '../../../../core/modules/StateEvaluator';
import { SmartWeaveGlobal } from '../../../../legacy/smartweave-global';
import { timeout, deepCopy } from '../../../../utils/utils';
import { InteractionData, InteractionResult } from '../HandlerExecutorFactory';
import { AbstractContractHandler } from './AbstractContractHandler';

export class JsHandlerApi<State> extends AbstractContractHandler<State> {
  constructor(
    swGlobal: SmartWeaveGlobal,
    contractDefinition: ContractDefinition<State>,
    // eslint-disable-next-line
    private readonly contractFunction: Function
  ) {
    super(swGlobal, contractDefinition);
  }

  async handle<Input, Result>(
    executionContext: ExecutionContext<State>,
    currentResult: EvalStateResult<State>,
    interactionData: InteractionData<Input>
  ): Promise<InteractionResult<State, Result>> {
    const { timeoutId, timeoutPromise } = timeout(
      executionContext.evaluationOptions.maxInteractionEvaluationTimeSeconds
    );

    try {
      const { interaction, interactionTx, currentTx } = interactionData;

      const stateCopy = deepCopy(currentResult.state);
      this.swGlobal._activeTx = interactionTx;
      this.swGlobal.caller = interaction.caller; // either contract tx id (for internal writes) or transaction.owner
      this.assignReadContractState<Input>(executionContext, currentTx, currentResult, interactionTx);
      this.assignViewContractState<Input>(executionContext);
      this.assignWrite(executionContext, currentTx);
      this.assignRefreshState(executionContext);

      const { warp } = executionContext;
      if (warp.hasPlugin('smartweave-extension')) {
        const extension = warp.loadPlugin<any, void>('smartweave-extension');
        extension.process(this.swGlobal.extensions);
      }

      const handlerResult = await Promise.race([timeoutPromise, this.contractFunction(stateCopy, interaction)]);

      if (handlerResult && (handlerResult.state !== undefined || handlerResult.result !== undefined)) {
        return {
          type: 'ok',
          result: handlerResult.result,
          state: handlerResult.state || currentResult.state
        };
      }

      // Will be caught below as unexpected exception.
      throw new Error(`Unexpected result from contract: ${JSON.stringify(handlerResult)}`);
    } catch (err) {
      switch (err.name) {
        case 'ContractError':
          return {
            type: 'error',
            errorMessage: err.message,
            state: currentResult.state,
            // note: previous version was writing error message to a "result" field,
            // which fucks-up the HandlerResult type definition -
            // HandlerResult.result had to be declared as 'Result | string' - and that led to a poor dev exp.
            // TODO: this might be breaking change!
            result: null
          };
        default:
          return {
            type: 'exception',
            errorMessage: `${(err && err.stack) || (err && err.message) || err}`,
            state: currentResult.state,
            result: null
          };
      }
    } finally {
      if (timeoutId !== null) {
        // it is important to clear the timeout promise
        // - promise.race won't "cancel" it automatically if the "handler" promise "wins"
        // - and this would ofc. cause a waste in cpu cycles
        // (+ Jest complains about async operations not being stopped properly).
        clearTimeout(timeoutId);
      }
    }
  }

  initState(state: State): void {
    // nth to do in this impl...
  }
}
