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
  WarpLogger,
  SmartWeaveGlobal,
  timeout
} from '@warp';

export class ContractHandlerApi<State> implements HandlerApi<State> {
  private readonly contractLogger: WarpLogger;
  private readonly logger = LoggerFactory.INST.create('ContractHandlerApi');

  constructor(
    private readonly swGlobal: SmartWeaveGlobal,
    // eslint-disable-next-line
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
    const { timeoutId, timeoutPromise } = timeout(
      executionContext.evaluationOptions.maxInteractionEvaluationTimeSeconds
    );

    try {
      const { interaction, interactionTx, currentTx } = interactionData;

      const stateCopy = deepCopy(currentResult.state, executionContext.evaluationOptions.useFastCopy);
      this.swGlobal._activeTx = interactionTx;
      this.swGlobal.caller = interaction.caller; // either contract tx id (for internal writes) or transaction.owner
      this.assignReadContractState<Input>(executionContext, currentTx, currentResult, interactionTx);
      this.assignViewContractState<Input>(executionContext);
      this.assignWrite(executionContext, currentTx);
      this.assignRefreshState(executionContext);

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
        validity: {},
        errorMessages: {}
      });

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
      const childContract = executionContext.warp.contract(
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
    this.swGlobal.contracts.readContractState = async (contractTxId: string, returnValidity?: boolean) => {
      this.logger.debug('swGlobal.readContractState call:', {
        from: this.contractDefinition.txId,
        to: contractTxId,
        sortKey: interactionTx.sortKey,
        transaction: this.swGlobal.transaction.id
      });

      const { stateEvaluator } = executionContext.warp;
      const childContract = executionContext.warp.contract(contractTxId, executionContext.contract, interactionTx);

      await stateEvaluator.onContractCall(interactionTx, executionContext, currentResult);

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

  private assignRefreshState(executionContext: ExecutionContext<State>) {
    this.swGlobal.contracts.refreshState = async () => {
      const stateEvaluator = executionContext.warp.stateEvaluator;
      const result = await stateEvaluator.latestAvailableState(
        this.swGlobal.contract.id,
        this.swGlobal._activeTx.sortKey
      );
      return result?.cachedValue.state;
    };
  }

  initState(state: State): void {
    // nth to do in this impl...
  }
}
