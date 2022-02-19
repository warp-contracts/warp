/* eslint-disable */
import {
  ContractDefinition,
  EvalStateResult,
  ExecutionContext,
  HandlerApi,
  InteractionData,
  InteractionResult,
  LoggerFactory,
  RedStoneLogger,
  SmartWeaveGlobal
} from '@smartweave';
import stringify from "safe-stable-stringify";

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

  initState(state: State): void {
    const statePtr = this.wasmExports.__newString(stringify(state));
    this.wasmExports.initState(statePtr);
  }

  async handle<Input, Result>(
    executionContext: ExecutionContext<State>,
    currentResult: EvalStateResult<State>,
    interactionData: InteractionData<Input>
  ): Promise<InteractionResult<State, Result>> {
    try {
      const {interaction, interactionTx, currentTx} = interactionData;

      this.swGlobal._activeTx = interactionTx;

      const handlerResult = this.doHandle(interaction);

      return {
        type: 'ok',
        result: handlerResult,
        state: this.doGetCurrentState()
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
      // - eg: [CE:WTF] - [ContractException: WhatTheFunction] ;-)
      if (e.message.startsWith('[RE:')) {
        return {
          type: 'exception',
          errorMessage: e.message,
          state: currentResult.state,
          result: null
        };
      } else {
        return {
          type: 'error',
          errorMessage: e.message,
          state: currentResult.state,
          result: null
        };
      }
    }
  }

  private doHandle(action: any): any {
    this.logger.info("Action", action.input);
    const actionPtr = this.wasmExports.__newString(stringify(action.input));
    const resultPtr = this.wasmExports.handle(actionPtr);
    const result = this.wasmExports.__getString(resultPtr);

    this.logger.info("Result", result);
    this.logger.info("State", this.doGetCurrentState());

    return JSON.parse(result);
  }

  private doGetCurrentState(): State {
    const currentStatePtr = this.wasmExports.currentState();
    return JSON.parse(this.wasmExports.__getString(currentStatePtr));
  }
}
