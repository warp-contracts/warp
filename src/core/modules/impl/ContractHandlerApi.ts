import {
  ContractDefinition,
  CurrentTx,
  deepCopy,
  EvalStateResult,
  ExecutionContext,
  GQLNodeInterface,
  HandlerApi,
  HandlerFunction,
  InteractionData,
  InteractionResult,
  LoggerFactory,
  RedStoneLogger,
  SmartWeaveGlobal
} from '@smartweave';
import BigNumber from 'bignumber.js';
import * as clarity from '@weavery/clarity';

export class ContractHandlerApi<State> implements HandlerApi<State> {
  private readonly contractLogger: RedStoneLogger;
  private readonly logger = LoggerFactory.INST.create('ContractHandler');

  constructor(
    private readonly swGlobal: SmartWeaveGlobal,
    private readonly contractFunction: Function,
    private readonly contractDefinition: ContractDefinition<State>
  ) {
    this.contractLogger = LoggerFactory.INST.create(swGlobal.contract.id);

    this.assignReadContractState = this.assignReadContractState.bind(this);
    this.assignViewContractState = this.assignViewContractState.bind(this);
    this.assignWrite = this.assignWrite.bind(this);
    this.assignRefreshState = this.assignRefreshState.bind(this);
  }

  async handle<Input, Result>(
    executionContext: ExecutionContext<State>,
    currentResult: EvalStateResult<State>,
    interactionData: InteractionData<Input>
  ): Promise<InteractionResult<State, Result>> {
    const contractLogger = LoggerFactory.INST.create('Contract');

    try {
      const { interaction, interactionTx, currentTx } = interactionData;

      const handler = this.contractFunction(this.swGlobal, BigNumber, clarity, contractLogger) as HandlerFunction<
        State,
        Input,
        Result
      >;
      const stateCopy = deepCopy(currentResult.state);
      this.swGlobal._activeTx = interactionTx;
      this.logger.trace(`SmartWeave.contract.id:`, this.swGlobal.contract.id);

      this.assignReadContractState<Input>(executionContext, currentTx, currentResult, interactionTx);
      this.assignViewContractState<Input>(executionContext);
      this.assignWrite(executionContext, currentTx);
      this.assignRefreshState(executionContext);

      const handlerResult = await handler(stateCopy, interaction);
      this.logger.debug('handlerResult', handlerResult);

      if (handlerResult && (handlerResult.state || handlerResult.result)) {
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
            errorMessage: `${(err && err.stack) || (err && err.message)}`,
            state: currentResult.state,
            result: null
          };
      }
    }
  }

  private assignWrite(executionContext: ExecutionContext<State>, currentTx: CurrentTx[]) {
    this.swGlobal.contracts.write = async <Input = unknown>(contractTxId: string, input: Input) => {
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
          validity: {}
        }
      );

      return result;
    };
  }

  private assignViewContractState<Input>(executionContext: ExecutionContext<State>) {
    this.swGlobal.contracts.viewContractState = async <View>(contractTxId: string, input: any) => {
      this.logger.debug('swGlobal.viewContractState call:', {
        from: this.contractDefinition.txId,
        to: contractTxId,
        input
      });
      const childContract = executionContext.smartweave.contract(
        contractTxId,
        executionContext.contract,
        this.swGlobal._activeTx
      );

      return await childContract.viewStateForTx(input, this.swGlobal._activeTx);
    };
  }

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

      await stateEvaluator.onContractCall(interactionTx, executionContext, currentResult);

      const stateWithValidity = await childContract.readState(requestedHeight, [
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

  private assignRefreshState(executionContext: ExecutionContext<State>) {
    this.swGlobal.contracts.refreshState = async () => {
      const stateEvaluator = executionContext.smartweave.stateEvaluator;
      console.log('refresh:', {
        contract: this.swGlobal.contract.id,
        height: this.swGlobal.block.height
      });
      const result = await stateEvaluator.latestAvailableState(this.swGlobal.contract.id, this.swGlobal.block.height);
      return result?.cachedValue.state;
    };
  }
}
