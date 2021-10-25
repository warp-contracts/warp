import Arweave from 'arweave';
import {
  ContractDefinition,
  EvalStateResult,
  ExecutionContext,
  ExecutorFactory,
  GQLNodeInterface,
  LoggerFactory,
  normalizeContractSource,
  SmartWeaveGlobal
} from '@smartweave';
import { ContractHandlerApi } from './ContractHandlerApi';

export interface InteractionData<Input> {
  interaction?: ContractInteraction<Input>;
  interactionTx: GQLNodeInterface;
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

  constructor(private readonly arweave: Arweave) {}

  async create<State>(contractDefinition: ContractDefinition<State>): Promise<HandlerApi<State>> {
    const normalizedSource = normalizeContractSource(contractDefinition.src);

    const swGlobal = new SmartWeaveGlobal(this.arweave, {
      id: contractDefinition.txId,
      owner: contractDefinition.owner
    });
    const contractFunction = new Function(normalizedSource);

    return new ContractHandlerApi(swGlobal, contractFunction, contractDefinition);
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
