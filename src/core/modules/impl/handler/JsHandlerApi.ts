import { ContractDefinition } from '../../../../core/ContractDefinition';
import { ExecutionContext } from '../../../../core/ExecutionContext';
import { EvalStateResult } from '../../../../core/modules/StateEvaluator';
import { SmartWeaveGlobal } from '../../../../legacy/smartweave-global';
import { deepCopy, timeout } from '../../../../utils/utils';
import { InteractionData, InteractionResult } from '../HandlerExecutorFactory';
import { AbstractContractHandler } from './AbstractContractHandler';

const INIT_FUNC_NAME = '__init';

export class JsHandlerApi<State> extends AbstractContractHandler<State> {
  constructor(
    swGlobal: SmartWeaveGlobal,
    contractDefinition: ContractDefinition<State>,
    // eslint-disable-next-line
    private readonly contractFunction: Function
  ) {
    super(swGlobal, contractDefinition);
  }


  private async runContractFunction<Input>(
    executionContext: ExecutionContext<State>,
    interaction: InteractionData<Input>['interaction'],
    state: State
  ) {
    const { timeoutId, timeoutPromise } = timeout(
      executionContext.evaluationOptions.maxInteractionEvaluationTimeSeconds
    );
    await this.swGlobal.kv.open();

    const handlerResult = await Promise.race([timeoutPromise, this.contractFunction(state, interaction)]).finally(
      // it is important to clear the timeout promise
      // - promise.race won't "cancel" it automatically if the "handler" promise "wins"
      // - and this would ofc. cause a waste in cpu cycles
      // (+ Jest complains about async operations not being stopped properly).
      () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    );

    if (handlerResult && (handlerResult.state !== undefined || handlerResult.result !== undefined)) {
      await this.swGlobal.kv.commit();
      return {
        type: 'ok' as const,
        result: handlerResult.result,
        state: handlerResult.state || state
      };
    }

    // Will be caught below as unexpected exception.
    throw new Error(`Unexpected result from contract: ${JSON.stringify(handlerResult)}`);
  }

  private setup<Input>({ interaction, interactionTx }: InteractionData<Input>, executionContext: ExecutionContext<State>) {
    // maybe modify if constructor used
    this.swGlobal._activeTx = interactionTx;
    this.swGlobal.caller = interaction.caller; // either contract tx id (for internal writes) or transaction.owner

    this.assignReadContractState(executionContext, interactionTx);
    this.assignViewContractState<Input>(executionContext);
    this.assignWrite(executionContext);
    this.assignRefreshState(executionContext);
  }

  async handle<Input, Result>(
    executionContext: ExecutionContext<State>,
    currentResult: EvalStateResult<State>,
    interactionData: InteractionData<Input>,
  ): Promise<InteractionResult<State, Result>> {

    try {
      const { interaction } = interactionData;

      this.setup(interactionData, executionContext);

      if (this.contractDefinition.manifest?.evaluationOptions.useConstructor && interaction.input['function'] === INIT_FUNC_NAME) {
        throw new Error(`You have enabled {useConstructor: true} option, so you can't call function ${INIT_FUNC_NAME}`)
      }

      return await this.runContractFunction(
        executionContext,
        interaction,
        deepCopy(currentResult.state)
      )

    } catch (err) {
      await this.swGlobal.kv.rollback();
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
      await this.swGlobal.kv.close();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  initState(state: State): void {

  }

  async maybeCallStateConstructor<Input>(initialState: State, executionContext: ExecutionContext<State>): Promise<State> {
    if (this.contractDefinition.manifest?.evaluationOptions.useConstructor) {
      const interaction = { input: { function: INIT_FUNC_NAME, args: initialState } as Input, caller: this.contractDefinition.owner };
      // TODO: we have to use some default sort key like 0,0,0,0
      const interactionData: InteractionData<Input> = { interaction, interactionTx: { ...this.contractDefinition.contractTx, sortKey: '0.0.0.0' } };
      this.setup(interactionData, executionContext);
      try {
        const result = await this.runContractFunction(
          executionContext,
          interaction,
          {} as State
        );
        return result.state;
      } catch (e) {
        await this.swGlobal.kv.rollback();
        throw Error("Constructor evaluation error: " + e.toString());
      } finally {
        await this.swGlobal.kv.close();
      }
    } else {
      return initialState;
    }
  }
}
