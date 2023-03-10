/* eslint-disable */
import { ContractDefinition } from '../../../../core/ContractDefinition';
import { ExecutionContext } from '../../../../core/ExecutionContext';
import { EvalStateResult } from '../../../../core/modules/StateEvaluator';
import { SmartWeaveGlobal } from '../../../../legacy/smartweave-global';
import { ContractError, ContractInteraction, InteractionData, InteractionResult } from '../HandlerExecutorFactory';
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
      const result = {
        errorMessage: e.message,
        state: currentResult.state,
        result: null
      };
      if (e instanceof ContractError) {
        return {
          ...result,
          error: e.error,
          type: 'error'
        };
      } else {
        return {
          ...result,
          type: 'exception'
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

  private async doHandle(action: ContractInteraction<unknown>): Promise<any> {
    switch (this.contractDefinition.srcWasmLang) {
      case 'rust': {

        const handleResult = action.interactionType === 'write' ? await this.wasmExports.warpContractWrite(action.input) : await this.wasmExports.warpContractView(action.input);

        if (!handleResult) {
          return;
        }
        if (handleResult.type === 'ok') {
          return handleResult.result;
        }
        this.logger.error('Error from rust', handleResult);
        if (handleResult.type === 'error') throw new ContractError(handleResult.error);
        throw new Error(handleResult.errorMessage);
      }
      default: {
        throw new Error(`Support for ${this.contractDefinition.srcWasmLang} not implemented yet.`);
      }
    }
  }

  async maybeCallStateConstructor(
    initialState: State,
    executionContext: ExecutionContext<State, unknown>
  ): Promise<State> {
    if (this.contractDefinition.manifest?.evaluationOptions?.useConstructor) {
      throw Error('Constructor is not implemented for wasm');
    }
    return initialState;
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
