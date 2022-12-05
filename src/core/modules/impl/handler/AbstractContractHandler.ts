import { CurrentTx } from '../../../../contract/Contract';
import { ContractDefinition } from '../../../../core/ContractDefinition';
import { ExecutionContext } from '../../../../core/ExecutionContext';
import { EvalStateResult } from '../../../../core/modules/StateEvaluator';
import { GQLNodeInterface } from '../../../../legacy/gqlResult';
import { SmartWeaveGlobal } from '../../../../legacy/smartweave-global';
import { LoggerFactory } from '../../../../logging/LoggerFactory';
import { deepCopy } from '../../../../utils/utils';
import { ContractError, HandlerApi, InteractionData, InteractionResult } from '../HandlerExecutorFactory';

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
      input: Input,
      throwOnError?: boolean
    ): Promise<InteractionResult<unknown, unknown>> => {
      if (!executionContext.evaluationOptions.internalWrites) {
        throw new Error("Internal writes feature switched off. Change EvaluationOptions.internalWrites flag to 'true'");
      }

      const effectiveThrowOnError =
        throwOnError == undefined ? executionContext.evaluationOptions.throwOnInternalWriteError : throwOnError;

      const debugData = {
        from: this.contractDefinition.txId,
        to: contractTxId,
        input
      };
      console.error('swGlobal.write call:', debugData);

      const calleeContract = executionContext.warp.contract(contractTxId, executionContext.contract, {
        callingInteraction: this.swGlobal._activeTx,
        callType: 'write'
      });

      const result = await calleeContract.dryWriteFromTx<Input>(input, this.swGlobal._activeTx, [
        ...(currentTx || []),
        {
          contractTxId: this.contractDefinition.txId,
          interactionTxId: this.swGlobal.transaction.id
        }
      ]);
      console.dir(result, {depth: null});

      this.logger.debug('Cache result?:', !this.swGlobal._activeTx.dry);
      const shouldAutoThrow =
        result.type !== 'ok' &&
        effectiveThrowOnError &&
        (!this.swGlobal._activeTx.dry || (this.swGlobal._activeTx.dry && this.swGlobal._activeTx.strict));
      const effectiveErrorMessage = shouldAutoThrow
        ? `Internal write auto error for call [${JSON.stringify(debugData)}]: ${result.errorMessage}`
        : result.errorMessage;

      calleeContract.uncommittedState = {
        state: result.state as State,
        validity: {
          ...result.originalValidity,
          [this.swGlobal._activeTx.id]: result.type == 'ok'
        },
        errorMessages: {
          ...result.originalErrorMessages,
          [this.swGlobal._activeTx.id]: effectiveErrorMessage
        }
      };

      if (shouldAutoThrow) {
        throw new ContractError(effectiveErrorMessage);
      }

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
      const childContract = executionContext.warp.contract(contractTxId, executionContext.contract, {
        callingInteraction: this.swGlobal._activeTx,
        callType: 'view'
      });

      return await childContract.viewStateForTx(input, this.swGlobal._activeTx);
    };
  }

  protected assignReadContractState<Input>(
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
      const childContract = executionContext.warp.contract(contractTxId, executionContext.contract, {
        callingInteraction: interactionTx,
        callType: 'read'
      });

      await stateEvaluator.onContractCall(interactionTx, executionContext, currentResult);

      const stateWithValidity = await childContract.readState(interactionTx.sortKey, [
        ...(currentTx || []),
        {
          contractTxId: this.contractDefinition.txId,
          interactionTxId: this.swGlobal.transaction.id
        }
      ]);

      if (stateWithValidity?.cachedValue?.errorMessages) {
        const errorKeys = Reflect.ownKeys(stateWithValidity?.cachedValue?.errorMessages);
        if (errorKeys.length) {
          const lastErrorKey = errorKeys[errorKeys.length - 1] as string;
          const lastErrorMessage = stateWithValidity?.cachedValue?.errorMessages[lastErrorKey];
          // don't judge me..
          if (lastErrorMessage.startsWith('[SkipUnsafeError]')) {
            throw new ContractError(lastErrorMessage);
          }
        }
      }

      // TODO: it should be up to the client's code to decide which part of the result to use
      // (by simply using destructuring operator)...
      // but this (i.e. returning always stateWithValidity from here) would break backwards compatibility
      // in current contract's source code..:/
      return returnValidity
        ? {
            state: deepCopy(stateWithValidity.cachedValue.state),
            validity: stateWithValidity.cachedValue.validity,
            errorMessages: stateWithValidity.cachedValue.errorMessages
          }
        : deepCopy(stateWithValidity.cachedValue.state);
    };
  }

  protected assignRefreshState(executionContext: ExecutionContext<State>) {
    this.swGlobal.contracts.refreshState = async () => {
      const stateEvaluator = executionContext.warp.stateEvaluator;
      const result = await stateEvaluator.latestAvailableState(
        this.swGlobal.contract.id,
        this.swGlobal._activeTx.sortKey
      );
      return result?.cachedValue.state;
    };
  }
}
