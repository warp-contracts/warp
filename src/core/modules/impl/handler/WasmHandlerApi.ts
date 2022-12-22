/* eslint-disable */
import { ContractDefinition } from '../../../../core/ContractDefinition';
import { ExecutionContext } from '../../../../core/ExecutionContext';
import {
  Deserializers,
  EvalStateResult,
  SerializationFormat,
  Serializers
} from '../../../../core/modules/StateEvaluator';
import { SmartWeaveGlobal } from '../../../../legacy/smartweave-global';
import stringify from 'safe-stable-stringify';
import { ContractInteraction, InteractionData, InteractionResult } from '../HandlerExecutorFactory';
import { AbstractContractHandler } from './AbstractContractHandler';
import { exhaustive } from 'utils/utils';

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
      const { interaction, interactionTx, currentTx } = interactionData;
      const { gasLimit, wasmSerializationFormat } = executionContext.evaluationOptions;

      this.swGlobal._activeTx = interactionTx;
      this.swGlobal.caller = interaction.caller; // either contract tx id (for internal writes) or transaction.owner
      this.swGlobal.gasLimit = gasLimit;
      this.swGlobal.gasUsed = 0;

      this.assignReadContractState<Input>(executionContext, currentTx, currentResult, interactionTx);
      this.assignWrite(executionContext, currentTx);

      const handlerResult = await this.doHandle(interaction, wasmSerializationFormat);

      return {
        type: 'ok',
        result: handlerResult,
        state: this.doGetCurrentState(wasmSerializationFormat), // TODO: return only at the end of evaluation and when caching is required
        gasUsed: this.swGlobal.gasUsed
      };
    } catch (e) {
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
    }
  }

  // TODO:noom support SerializationFormat here too
  initState(state: State, format: SerializationFormat): void {
    switch (this.contractDefinition.srcWasmLang) {
      case 'assemblyscript': {
        const statePtr = this.wasmExports.__newString(stringify(state));
        this.wasmExports.initState(statePtr);
        break;
      }
      case 'rust': {
        this.wasmExports.initState(Serializers[format](state));
        break;
      }
      case 'go': {
        this.wasmExports.initState(stringify(state));
        break;
      }
      default: {
        throw new Error(`Support for ${this.contractDefinition.srcWasmLang} not implemented yet.`);
      }
    }
  }

  private async doHandle<INPUT>(action: ContractInteraction<INPUT>, format: SerializationFormat): Promise<any> {
    switch (this.contractDefinition.srcWasmLang) {
      case 'assemblyscript': {
        const actionPtr = this.wasmExports.__newString(stringify(action.input));
        const resultPtr = this.wasmExports.handle(actionPtr);
        const result = this.wasmExports.__getString(resultPtr);

        return JSON.parse(result);
      }
      case 'rust': {
        const handleResult = await this.wasmExports.handle(Serializers[format](action.input));

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
      case 'go': {
        const result = await this.wasmExports.handle(stringify(action.input));
        return JSON.parse(result);
      }
      default: {
        throw new Error(`Support for ${this.contractDefinition.srcWasmLang} not implemented yet.`);
      }
    }
  }

  private doGetCurrentState(format: SerializationFormat): State {
    switch (this.contractDefinition.srcWasmLang) {
      case 'assemblyscript': {
        const currentStatePtr = this.wasmExports.currentState();
        return JSON.parse(this.wasmExports.__getString(currentStatePtr));
      }
      case 'rust': {
        return Deserializers[format](this.wasmExports.currentState());
      }
      case 'go': {
        const result = this.wasmExports.currentState();
        return JSON.parse(result);
      }
      default: {
        throw new Error(`Support for ${this.contractDefinition.srcWasmLang} not implemented yet.`);
      }
    }
  }
}
