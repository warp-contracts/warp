import {
  ContractDefinition,
  EvalStateResult,
  ExecutionContext,
  InteractionData,
  InteractionResult,
  SmartWeaveGlobal
} from '@warp';
import { AbstractContractHandler } from './AbstractContractHandler';
import { Context, Isolate, Reference } from 'isolated-vm';

export class IvmHandlerApi<State> extends AbstractContractHandler<State> {
  constructor(
    swGlobal: SmartWeaveGlobal,
    contractDefinition: ContractDefinition<State>,
    private readonly ivm: {
      isolate: Isolate;
      context: Context;
      sandbox: Reference<Record<number | string | symbol, any>>;
      contract: Reference;
    }
  ) {
    super(swGlobal, contractDefinition);
  }

  async handle<Input, Result>(
    executionContext: ExecutionContext<State>,
    currentResult: EvalStateResult<State>,
    interactionData: InteractionData<Input>
  ): Promise<InteractionResult<State, Result>> {
    try {
      const { interaction, interactionTx, currentTx } = interactionData;

      this.swGlobal._activeTx = interactionTx;
      this.swGlobal.caller = interaction.caller; // either contract tx id (for internal writes) or transaction.owner

      this.assignReadContractState<Input>(executionContext, currentTx, currentResult, interactionTx);
      this.assignViewContractState<Input>(executionContext);
      this.assignWrite(executionContext, currentTx);
      this.assignRefreshState(executionContext);

      const handlerResult: any = await this.ivm.contract.apply(undefined, [currentResult.state, interaction], {
        arguments: { copy: true },
        result: { copy: true, promise: true }
      });

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
      if (err.stack.includes('ContractError')) {
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
      } else {
        return {
          type: 'exception',
          errorMessage: `${(err && err.stack) || (err && err.message) || err}`,
          state: currentResult.state,
          result: null
        };
      }
    }
  }

  initState(state: State): void {
    // nth to do in this impl...
  }

  async dispose(): Promise<void> {
    /*try {
      this.ivm.contract.release();
      this.ivm.sandbox.release();
      this.ivm.context.release();
      this.ivm.isolate.dispose();
    } catch (e: any) {
      this.logger.error(e);
    }*/
  }
}
