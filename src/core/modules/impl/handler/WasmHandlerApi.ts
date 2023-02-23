/* eslint-disable */
import { ContractDefinition } from '../../../../core/ContractDefinition';
import { ExecutionContext } from '../../../../core/ExecutionContext';
import { EvalStateResult } from '../../../../core/modules/StateEvaluator';
import { SmartWeaveGlobal } from '../../../../legacy/smartweave-global';
import { InteractionData, InteractionResult } from '../HandlerExecutorFactory';
import { AbstractContractHandler } from './AbstractContractHandler';

export class WasmHandlerApi<State> extends AbstractContractHandler<State> {
  constructor(
    swGlobal: SmartWeaveGlobal,
    // eslint-disable-next-line
    contractDefinition: ContractDefinition<State>,
    private readonly wasmExports: any
  ) {
    super(swGlobal, contractDefinition);
  }

  async handle<Input, Result>(
    executionContext: ExecutionContext<State>,
    currentResult: EvalStateResult<State>,
    interactionData: InteractionData<Input>
  ): Promise<InteractionResult<State, Result>> {
    try {
      const { interaction, interactionTx } = interactionData;

      this.swGlobal._activeTx = interactionTx;
      this.swGlobal.caller = interaction.caller; // either contract tx id (for internal writes) or transaction.owner
      this.swGlobal.gasLimit = executionContext.evaluationOptions.gasLimit;
      this.swGlobal.gasUsed = 0;

      this.assignReadContractState(executionContext, interactionTx);
      this.assignViewContractState<Input>(executionContext);
      this.assignWrite(executionContext);

      await this.swGlobal.kv.open();
      const handlerResult = await this.doHandle(interaction);
      await this.swGlobal.kv.commit();
      return {
        type: 'ok',
        result: handlerResult,
        state: this.doGetCurrentState(), // TODO: return only at the end of evaluation and when caching is required
        gasUsed: this.swGlobal.gasUsed
      };
    } catch (e) {
      await this.swGlobal.kv.rollback();
      // note: as exceptions handling in WASM is currently somewhat non-existent
      // https://www.assemblyscript.org/status.html#exceptions
      // and since we have to somehow differentiate different types of exceptions
      // - each exception message has to have a proper prefix added.

      // exceptions with prefix [RE:] ("Runtime Exceptions") should break the execution immediately
      // - eg: [RE:OOG] - [RuntimeException: OutOfGas]

      // exception with prefix [CE:] ("Contract Exceptions") should be logged, but should not break
      // the state evaluation - as they are considered as contracts' business exception (eg. validation errors)
      // - eg: [CE:ITT] - [ContractException: InvalidTokenTransfer]
      const result = {
        errorMessage: e.message,
        state: currentResult.state,
        result: null
      };
      if (e.message.startsWith('[RE:')) {
        this.logger.fatal(e);
        return {
          ...result,
          type: 'exception'
        };
      } else {
        return {
          ...result,
          type: 'error'
        };
      }
    } finally {
      await this.swGlobal.kv.close();
    }
  }

  initState(state: State): void {
    switch (this.contractDefinition.srcWasmLang) {
      case 'rust': {
        this.wasmExports.initState(state);
        break;
      }
      default: {
        throw new Error(`Support for ${this.contractDefinition.srcWasmLang} not implemented yet.`);
      }
    }
  }

  private async doHandle(action: any): Promise<any> {
    switch (this.contractDefinition.srcWasmLang) {
      case 'rust': {
        let handleResult = await this.wasmExports.handle(action.input);
        if (!handleResult) {
          return;
        }
        if (Object.prototype.hasOwnProperty.call(handleResult, 'Ok')) {
          return handleResult.Ok;
        } else {
          this.logger.debug('Error from rust', handleResult.Err);
          let errorKey;
          let errorArgs = '';
          if (typeof handleResult.Err === 'string' || handleResult.Err instanceof String) {
            errorKey = handleResult.Err;
          } else if ('kind' in handleResult.Err) {
            errorKey = handleResult.Err.kind;
            errorArgs = 'data' in handleResult.Err ? ' ' + handleResult.Err.data : '';
          } else {
            errorKey = Object.keys(handleResult.Err)[0];
            errorArgs = ' ' + handleResult.Err[errorKey];
          }

          if (errorKey == 'RuntimeError') {
            throw new Error(`[RE:RE]${errorArgs}`);
          } else {
            throw new Error(`[CE:${errorKey}${errorArgs}]`);
          }
        }
      }
      default: {
        throw new Error(`Support for ${this.contractDefinition.srcWasmLang} not implemented yet.`);
      }
    }
  }

  private doGetCurrentState(): State {
    switch (this.contractDefinition.srcWasmLang) {
      case 'rust': {
        return this.wasmExports.currentState();
      }
      default: {
        throw new Error(`Support for ${this.contractDefinition.srcWasmLang} not implemented yet.`);
      }
    }
  }
}
