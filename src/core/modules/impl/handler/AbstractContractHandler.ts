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
  SmartWeaveGlobal
} from '@warp';

export abstract class AbstractContractHandler<State> implements HandlerApi<State> {
  protected logger = LoggerFactory.INST.create('ContractHandler');

  protected constructor(
    protected readonly swGlobal: SmartWeaveGlobal,
    protected readonly contractDefinition: ContractDefinition<State>
  ) {
    this.assignReadContractState = this.assignReadContractState.bind(this);
    this.assignViewContractState = this.assignViewContractState.bind(this);
    this.assignWrite = this.assignWrite.bind(this);
    this.assignRefreshState = this.assignRefreshState.bind(this);
  }

  abstract handle<Input, Result>(
    executionContext: ExecutionContext<State>,
    currentResult: EvalStateResult<State>,
    interactionData: InteractionData<Input>
  ): Promise<InteractionResult<State, Result>>;

  abstract initState(state: State): void;

  async dispose(): Promise<void> {
    // noop by default;
  }

  protected assignWrite(executionContext: ExecutionContext<State>, currentTx: CurrentTx[]) {
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

      // The contract that we want to call and modify its state
      const calleeContract = executionContext.warp.contract(
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
      await executionContext.warp.stateEvaluator.onInternalWriteStateUpdate(this.swGlobal._activeTx, contractTxId, {
        state: result.state as State,
        validity: {}
      });

      return result;
    };
  }

  protected assignViewContractState<Input>(executionContext: ExecutionContext<State>) {
    this.swGlobal.contracts.viewContractState = async <View>(contractTxId: string, input: any) => {
      this.logger.debug('swGlobal.viewContractState call:', {
        from: this.contractDefinition.txId,
        to: contractTxId,
        input
      });
      const childContract = executionContext.warp.contract(
        contractTxId,
        executionContext.contract,
        this.swGlobal._activeTx
      );

      return await childContract.viewStateForTx(input, this.swGlobal._activeTx);
    };
  }

  protected assignReadContractState<Input>(
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

      const { stateEvaluator } = executionContext.warp;
      const childContract = executionContext.warp.contract(contractTxId, executionContext.contract, interactionTx);

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

  protected assignRefreshState(executionContext: ExecutionContext<State>) {
    this.swGlobal.contracts.refreshState = async () => {
      const stateEvaluator = executionContext.warp.stateEvaluator;
      const result = await stateEvaluator.latestAvailableState(this.swGlobal.contract.id, this.swGlobal.block.height);
      return result?.cachedValue.state;
    };
  }
}
