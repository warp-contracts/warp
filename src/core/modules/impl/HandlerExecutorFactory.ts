import Arweave from 'arweave';
import BigNumber from 'bignumber.js';
import * as clarity from '@weavery/clarity';
import {
  ContractDefinition,
  deepCopy,
  EvalStateResult,
  ExecutionContext,
  ExecutorFactory,
  InteractionTx,
  LoggerFactory,
  normalizeContractSource,
  SmartWeaveGlobal
} from '@smartweave';

export interface InteractionData<Input> {
  interaction: ContractInteraction<Input>;
  interactionTx: InteractionTx;
  currentTx: { interactionTxId: string; contractTxId: string }[];
}

/**
 * A handle that effectively runs contract's code.
 */
export interface HandlerApi<State> {
  handle<Input, Result>(
    executionContext: ExecutionContext<State>,
    currentResult: EvalStateResult<State>,
    interactionData: InteractionData<Input>
  ): Promise<InteractionResult<State, Result>>;
}

/**
 * A factory that produces handlers that are compatible with the "current" style of
 * writing SW contracts (ie. using "handle" function).
 * Note: this code is mostly ported from the previous version of the SDK and is somewhat messy...
 * First candidate for the refactor!
 */
export class HandlerExecutorFactory implements ExecutorFactory<HandlerApi<unknown>> {
  private readonly logger = LoggerFactory.INST.create('HandlerExecutorFactory');

  constructor(private readonly arweave: Arweave) {
    this.assignReadContractState = this.assignReadContractState.bind(this);
    this.assignViewContractState = this.assignViewContractState.bind(this);
  }

  async create<State>(contractDefinition: ContractDefinition<State>): Promise<HandlerApi<State>> {
    const normalizedSource = normalizeContractSource(contractDefinition.src);

    const swGlobal = new SmartWeaveGlobal(this.arweave, {
      id: contractDefinition.txId,
      owner: contractDefinition.owner
    });
    const contractFunction = new Function(normalizedSource);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const contractLogger = LoggerFactory.INST.create('Contract');

    return {
      async handle<Input, Result>(
        executionContext: ExecutionContext<State>,
        currentResult: EvalStateResult<State>,
        interactionData: InteractionData<Input>
      ): Promise<InteractionResult<State, Result>> {
        try {
          const { interaction, interactionTx, currentTx } = interactionData;

          const handler = contractFunction(swGlobal, BigNumber, clarity, contractLogger) as HandlerFunction<
            State,
            Input,
            Result
          >;
          const stateCopy = JSON.parse(JSON.stringify(currentResult.state));
          swGlobal._activeTx = interactionTx;
          self.logger.trace(`SmartWeave.contract.id:`, swGlobal.contract.id);

          // TODO: refactor - too many arguments
          self.assignReadContractState<Input, State>(
            swGlobal,
            contractDefinition,
            executionContext,
            currentTx,
            currentResult,
            interactionTx
          );
          self.assignViewContractState<Input, State>(swGlobal, contractDefinition, executionContext);

          const handlerResult = await handler(stateCopy, interaction);

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
    };
  }

  private assignViewContractState<Input, State>(
    swGlobal: SmartWeaveGlobal,
    contractDefinition: ContractDefinition<State>,
    executionContext: ExecutionContext<State>
  ) {
    swGlobal.contracts.viewContractState = async <View>(contractTxId: string, input: any) => {
      this.logger.debug('swGlobal.viewContractState call:', {
        from: contractDefinition.txId,
        to: contractTxId,
        input
      });
      const childContract = executionContext.smartweave
        .contract(contractTxId, executionContext.contract)
        .setEvaluationOptions(executionContext.evaluationOptions);

      return await childContract.viewStateForTx(input, swGlobal._activeTx);
    };
  }

  private assignReadContractState<Input, State>(
    swGlobal: SmartWeaveGlobal,
    contractDefinition: ContractDefinition<State>,
    executionContext: ExecutionContext<State>,
    currentTx: { interactionTxId: string; contractTxId: string }[],
    currentResult: EvalStateResult<State>,
    interactionTx: InteractionTx
  ) {
    swGlobal.contracts.readContractState = async (contractTxId: string, height?: number, returnValidity?: boolean) => {
      const requestedHeight = height || swGlobal.block.height;
      this.logger.debug('swGlobal.readContractState call:', {
        from: contractDefinition.txId,
        to: contractTxId,
        height: requestedHeight,
        transaction: swGlobal.transaction.id
      });

      const { stateEvaluator } = executionContext.smartweave;
      const childContract = executionContext.smartweave
        .contract(contractTxId, executionContext.contract, interactionTx)
        .setEvaluationOptions(executionContext.evaluationOptions);

      await stateEvaluator.onContractCall(interactionTx, executionContext, currentResult);

      const stateWithValidity = await childContract.readState(requestedHeight, [
        ...(currentTx || []),
        {
          contractTxId: contractDefinition.txId,
          interactionTxId: swGlobal.transaction.id
        }
      ]);

      // TODO: it should be up to the client's code to decide which part of the result to use
      // (by simply using destructuring operator)...
      // but this (i.e. returning always stateWithValidity from here) would break backwards compatibility
      // in current contract's source code..:/

      return returnValidity ? deepCopy(stateWithValidity) : deepCopy(stateWithValidity.state);
    };
  }
}

export type HandlerFunction<State, Input, Result> = (
  state: State,
  interaction: ContractInteraction<Input>
) => Promise<HandlerResult<State, Result>>;

// TODO: change to XOR between result and state?
export type HandlerResult<State, Result> = {
  result: Result;
  state: State;
};

export type InteractionResult<State, Result> = HandlerResult<State, Result> & {
  type: InteractionResultType;
  errorMessage?: string;
};

export type ContractInteraction<Input> = {
  input: Input;
  caller: string;
};

export type InteractionResultType = 'ok' | 'error' | 'exception';
