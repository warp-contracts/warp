import Arweave from 'arweave';
import {
  ContractDefinition,
  EvalStateResult,
  ExecutionContext,
  ExecutorFactory,
  InteractionTx,
  LoggerFactory,
  SmartWeaveGlobal
} from '@smartweave';
import { Handler } from './Handler';

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

  constructor(private readonly arweave: Arweave) {}

  async create<State>(contractDefinition: ContractDefinition<State>): Promise<HandlerApi<State>> {
    const normalizedSource = HandlerExecutorFactory.normalizeContractSource(contractDefinition.src);

    const swGlobal = new SmartWeaveGlobal(this.arweave, {
      id: contractDefinition.txId,
      owner: contractDefinition.owner
    });
    const contractFunction = new Function(normalizedSource);

    return new Handler(swGlobal, contractFunction, contractDefinition);
  }

  private static normalizeContractSource(contractSrc: string): string {
    // Convert from ES Module format to something we can run inside a Function.
    // Removes the `export` keyword and adds ;return handle to the end of the function.
    // Additionally it removes 'IIFE' declarations
    // (which may be generated when bundling multiple sources into one output file
    // - eg. using esbuild's "IIFE" bundle format).
    // We also assign the passed in SmartWeaveGlobal to SmartWeave, and declare
    // the ContractError exception.
    // We then use `new Function()` which we can call and get back the returned handle function
    // which has access to the per-instance globals.

    contractSrc = contractSrc
      .replace(/export\s+async\s+function\s+handle/gmu, 'async function handle')
      .replace(/export\s+function\s+handle/gmu, 'function handle')
      .replace(/\(\s*\(\)\s*=>\s*{/g, '')
      .replace(/\s*\(\s*function\s*\(\)\s*{/g, '')
      .replace(/}\s*\)\s*\(\)\s*;/g, '');

    return `
    const [SmartWeave, BigNumber, clarity, logger] = arguments;
    clarity.SmartWeave = SmartWeave;
    class ContractError extends Error { constructor(message) { super(message); this.name = 'ContractError' } };
    function ContractAssert(cond, message) { if (!cond) throw new ContractError(message) };
    ${contractSrc};
    return handle;
  `;
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
