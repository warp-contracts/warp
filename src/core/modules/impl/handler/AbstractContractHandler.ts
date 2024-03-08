import { ContractDefinition } from '../../../../core/ContractDefinition';
import { ExecutionContext } from '../../../../core/ExecutionContext';
import { EvalStateResult } from '../../../../core/modules/StateEvaluator';
import { GQLNodeInterface } from '../../../../legacy/gqlResult';
import { SmartWeaveGlobal } from '../../../../legacy/smartweave-global';
import { LoggerFactory } from '../../../../logging/LoggerFactory';
import { deepCopy } from '../../../../utils/utils';
import { ContractError, HandlerApi, InteractionData, InteractionResult } from '../HandlerExecutorFactory';
import { TagsParser } from '../TagsParser';
import { Contract } from '../../../../contract/Contract';

export abstract class AbstractContractHandler<State> implements HandlerApi<State> {
  protected logger = LoggerFactory.INST.create('ContractHandler');
  private readonly tagsParser = new TagsParser();

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

  abstract initState(state: State);

  abstract maybeCallStateConstructor(
    initialState: State,
    executionContext: ExecutionContext<State, unknown>
  ): Promise<State>;

  async dispose(): Promise<void> {
    // noop by default;
  }

  protected assignWrite(executionContext: ExecutionContext<State>) {
    this.swGlobal.contracts.write = async <Input = unknown>(
      contractTxId: string,
      input: Input,
      throwOnError?: boolean
    ): Promise<InteractionResult<unknown, unknown>> => {
      if (!executionContext.evaluationOptions.internalWrites) {
        throw new Error("Internal writes feature switched off. Change EvaluationOptions.internalWrites flag to 'true'");
      }
      const debugData = {
        from: this.contractDefinition.txId,
        to: contractTxId,
        input
      };

      const activeTx = this.swGlobal._activeTx;
      if (
        !activeTx.dry &&
        !this.tagsParser.hasInteractWriteTag(activeTx, contractTxId) &&
        !this.isWriteBack(executionContext.contract, contractTxId)
      ) {
        throw new Error(
          `No interact write tag for interaction ${activeTx.id}: ${JSON.stringify(debugData)} \n ${JSON.stringify(
            activeTx
          )}`
        );
      }

      const effectiveThrowOnError =
        throwOnError == undefined ? executionContext.evaluationOptions.throwOnInternalWriteError : throwOnError;
      this.logger.debug('swGlobal.write call:', debugData);

      // The contract that we want to call and modify its state
      const calleeContract = executionContext.warp.contract(contractTxId, executionContext.contract, {
        callingInteraction: activeTx,
        callType: 'write'
      });
      const result = await calleeContract.applyInput<Input>(input, activeTx, executionContext.signal);

      this.logger.debug('Cache result?:', !activeTx.dry);
      const shouldAutoThrow =
        result.type !== 'ok' && effectiveThrowOnError && (!activeTx.dry || (activeTx.dry && activeTx.strict));

      const effectiveErrorMessage = shouldAutoThrow
        ? `Internal write auto error for call [${JSON.stringify(debugData)}]: ${result.errorMessage}`
        : result.errorMessage;

      const resultErrorMessages = effectiveErrorMessage
        ? {
            ...result.originalErrorMessages,
            [activeTx.id]: effectiveErrorMessage
          }
        : result.originalErrorMessages;
      calleeContract.interactionState().update(
        calleeContract.txId(),
        {
          state: result.state as State,
          validity: {
            ...result.originalValidity,
            [activeTx.id]: result.type == 'ok'
          },
          errorMessages: resultErrorMessages
        },
        activeTx.sortKey
      );

      if (shouldAutoThrow) {
        throw new ContractError(result.type === 'error' && result.error ? result.error : effectiveErrorMessage);
      }

      return result;
    };
  }

  protected assignViewContractState<Input>(executionContext: ExecutionContext<State>) {
    this.swGlobal.contracts.viewContractState = async <View>(
      contractTxId: string,
      input: Input
    ): Promise<InteractionResult<unknown, View>> => {
      this.logger.debug('swGlobal.viewContractState call:', {
        from: this.contractDefinition.txId,
        to: contractTxId,
        input
      });
      const childContract = executionContext.warp.contract(contractTxId, executionContext.contract, {
        callingInteraction: this.swGlobal._activeTx,
        callType: 'view'
      });

      return await childContract.viewStateForTx<Input, View>(input, this.swGlobal._activeTx, executionContext.signal);
    };
  }

  protected assignReadContractState(executionContext: ExecutionContext<State>, interactionTx: GQLNodeInterface) {
    this.swGlobal.contracts.readContractState = async (contractTxId: string, returnValidity?: boolean) => {
      this.logger.debug('swGlobal.readContractState call:', {
        from: this.contractDefinition.txId,
        to: contractTxId,
        sortKey: interactionTx.sortKey,
        transaction: this.swGlobal.transaction.id
      });

      const { contract, warp, signal } = executionContext;

      const childContract = warp.contract(contractTxId, contract, {
        callingInteraction: interactionTx,
        callType: 'read'
      });

      const stateWithValidity = await childContract.readState(interactionTx.sortKey, undefined, signal);

      if (stateWithValidity?.cachedValue?.errorMessages) {
        const errorKeys = Reflect.ownKeys(stateWithValidity?.cachedValue?.errorMessages);
        if (errorKeys.length) {
          const lastErrorKey = errorKeys[errorKeys.length - 1] as string;
          const lastErrorMessage = stateWithValidity?.cachedValue?.errorMessages[lastErrorKey];
          // don't judge me..
          // FIXME: also - '?' is stinky...
          if (
            lastErrorMessage &&
            lastErrorMessage.startsWith &&
            (lastErrorMessage.startsWith('[SkipUnsafeError]') ||
              lastErrorMessage.startsWith('[NonWhitelistedSourceError]'))
          ) {
            throw new ContractError(lastErrorMessage);
          }
        }
      }

      // TODO: it should be up to the client's code to decide which part of the result to use
      // (by simply using destructuring operator)...
      // but this (i.e. returning always stateWithValidity from here) would break backwards compatibility
      // in current contract's source code..:/
      const result = returnValidity
        ? {
            state: deepCopy(stateWithValidity.cachedValue.state),
            validity: stateWithValidity.cachedValue.validity,
            errorMessages: stateWithValidity.cachedValue.errorMessages
          }
        : deepCopy(stateWithValidity.cachedValue.state);

      return result;
    };
  }

  protected assignRefreshState(executionContext: ExecutionContext<State>) {
    this.swGlobal.contracts.refreshState = async () => {
      return executionContext.contract
        .interactionState()
        .get(this.swGlobal.contract.id, this.swGlobal._activeTx.sortKey)?.state;
    };
  }

  private isWriteBack(contract: Contract<State>, target: string): boolean {
    let current = contract as Contract;
    while (current.parent()) {
      current = current.parent();
      if (current.txId() === target) {
        return true;
      }
    }

    return false;
  }
}
