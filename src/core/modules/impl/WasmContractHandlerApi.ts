/* eslint-disable */
import {
  ContractDefinition,
  CurrentTx,
  deepCopy,
  EvalStateResult,
  ExecutionContext,
  GQLNodeInterface,
  HandlerApi,
  InteractionData,
  InteractionResult,
  LoggerFactory,
  RedStoneLogger,
  SmartWeaveGlobal
} from '@smartweave';
import stringify from 'safe-stable-stringify';

export class WasmContractHandlerApi<State> implements HandlerApi<State> {
  private readonly contractLogger: RedStoneLogger;
  private readonly logger = LoggerFactory.INST.create('WasmContractHandlerApi');

  constructor(
    private readonly swGlobal: SmartWeaveGlobal,
    private readonly contractDefinition: ContractDefinition<State>,
    private readonly wasmExports: any
  ) {
    this.contractLogger = LoggerFactory.INST.create(swGlobal.contract.id);
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
      // TODO: this should be rather set on the HandlerFactory level..
      //  but currently no access to evaluationOptions there
      this.swGlobal.gasLimit = executionContext.evaluationOptions.gasLimit;
      this.swGlobal.gasUsed = 0;

      this.assignReadContractState<Input>(executionContext, currentTx, currentResult, interactionTx);
      this.assignWrite(executionContext, currentTx);

      const handlerResult = await this.doHandle(interaction);

      return {
        type: 'ok',
        result: handlerResult,
        state: this.doGetCurrentState(), // TODO: return only at the end of evaluation and when caching is required
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

  initState(state: State): void {
    switch (this.contractDefinition.srcWasmLang) {
      case 'assemblyscript': {
        const statePtr = this.wasmExports.__newString(stringify(state));
        this.wasmExports.initState(statePtr);
        break;
      }
      case 'rust': {
        this.wasmExports.initState(state);
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

  private async doHandle(action: any): Promise<any> {
    switch (this.contractDefinition.srcWasmLang) {
      case 'assemblyscript': {
        const actionPtr = this.wasmExports.__newString(stringify(action.input));
        const resultPtr = this.wasmExports.handle(actionPtr);
        const result = this.wasmExports.__getString(resultPtr);

        return JSON.parse(result);
      }
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

  private doGetCurrentState(): State {
    switch (this.contractDefinition.srcWasmLang) {
      case 'assemblyscript': {
        const currentStatePtr = this.wasmExports.currentState();
        return JSON.parse(this.wasmExports.__getString(currentStatePtr));
      }
      case 'rust': {
        return this.wasmExports.currentState();
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

  // TODO: c/p...
  private assignReadContractState<Input>(
    executionContext: ExecutionContext<State>,
    currentTx: CurrentTx[],
    currentResult: EvalStateResult<State>,
    interactionTx: GQLNodeInterface
  ) {
    this.swGlobal.contracts.readContractState = async (
      contractTxId: string,
      height?: number,
      returnValidity?: boolean
    ) => {
      const requestedHeight = height || this.swGlobal.block.height;
      this.logger.debug('swGlobal.readContractState call:', {
        from: this.contractDefinition.txId,
        to: contractTxId,
        height: requestedHeight,
        transaction: this.swGlobal.transaction.id
      });

      const { stateEvaluator } = executionContext.smartweave;
      const childContract = executionContext.smartweave.contract(
        contractTxId,
        executionContext.contract,
        interactionTx
      );

      // await stateEvaluator.onContractCall(interactionTx, executionContext, currentResult);

      const stateWithValidity = await childContract.readState(interactionTx.sortKey, [
        ...(currentTx || []),
        {
          contractTxId: this.contractDefinition.txId,
          interactionTxId: this.swGlobal.transaction.id
        }
      ]);

      // TODO: it should be up to the client's code to decide which part of the result to use
      // (by simply using destructuring operator)...
      // but this (i.e. returning always stateWithValidity from here) would break backwards compatibility
      // in current contract's source code..:/
      return returnValidity ? deepCopy(stateWithValidity) : deepCopy(stateWithValidity.state);
    };
  }

  private assignWrite(executionContext: ExecutionContext<State>, currentTx: CurrentTx[]) {
    this.swGlobal.contracts.write = async <Input = unknown>(
      contractTxId: string,
      input: Input
    ): Promise<InteractionResult<unknown, unknown>> => {
      if (!executionContext.evaluationOptions.internalWrites) {
        throw new Error("Internal writes feature switched off. Change EvaluationOptions.internalWrites flag to 'true'");
      }

      this.logger.debug('swGlobal.write call:', {
        from: this.contractDefinition.txId,
        to: contractTxId,
        input
      });

      const calleeContract = executionContext.smartweave.contract(
        contractTxId,
        executionContext.contract,
        this.swGlobal._activeTx
      );

      const result = await calleeContract.dryWriteFromTx<Input>(input, this.swGlobal._activeTx, [
        ...(currentTx || []),
        {
          contractTxId: this.contractDefinition.txId,
          interactionTxId: this.swGlobal.transaction.id
        }
      ]);

      this.logger.debug('Cache result?:', !this.swGlobal._activeTx.dry);
      await executionContext.smartweave.stateEvaluator.onInternalWriteStateUpdate(
        this.swGlobal._activeTx,
        contractTxId,
        {
          state: result.state as State,
          validity: {},
          errorMessages: {}
        }
      );

      return result;
    };
  }
}
