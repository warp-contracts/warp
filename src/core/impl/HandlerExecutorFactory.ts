import Arweave from 'arweave';
import BigNumber from 'bignumber.js';
import * as clarity from '@weavery/clarity';
import {
  ContractDefinition,
  ExecutionContext,
  ExecutorFactory,
  InteractionTx,
  LoggerFactory,
  SmartWeaveGlobal
} from '@smartweave';

/**
 * A handle that effectively runs contract's code.
 */
export interface HandlerApi<State> {
  handle<Input, Result>(
    executionContext: ExecutionContext<State>,
    state: State,
    interaction: ContractInteraction<Input>,
    interactionTx: InteractionTx,
    currentTx: { interactionTxId: string; contractTxId: string }[]
  ): Promise<InteractionResult<State, Result>>;
}

const logger = LoggerFactory.INST.create(__filename);

/**
 * A factory that produces handlers that are compatible with the "current" style of
 * writing SW contracts (ie. using "handle" function).
 */
export class HandlerExecutorFactory implements ExecutorFactory<HandlerApi<unknown>> {
  constructor(private readonly arweave: Arweave) {}

  async create<State>(contractDefinition: ContractDefinition<State>): Promise<HandlerApi<State>> {
    const normalizedSource = HandlerExecutorFactory.normalizeContractSource(contractDefinition.src);

    const swGlobal = new SmartWeaveGlobal(this.arweave, {
      id: contractDefinition.txId,
      owner: contractDefinition.owner
    });
    const contractFunction = new Function(normalizedSource);

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;

    return {
      async handle<Input, Result>(
        executionContext: ExecutionContext<State>,
        state: State,
        interaction: ContractInteraction<Input>,
        interactionTx: InteractionTx,
        currentTx: { interactionTxId: string; contractTxId: string }[]
      ): Promise<InteractionResult<State, Result>> {
        try {
          const handler = contractFunction(swGlobal, BigNumber, clarity) as HandlerFunction<State, Input, Result>;
          const stateCopy = JSON.parse(JSON.stringify(state));
          swGlobal._activeTx = interactionTx;
          logger.debug(`SmartWeave.contract.id: ${swGlobal.contract.id}`, swGlobal.contract.id);

          self.assignReadContractState<Input, State>(swGlobal, contractDefinition, executionContext, currentTx);
          self.assignViewContractState<Input, State>(swGlobal, contractDefinition, executionContext);

          const handlerResult = await handler(stateCopy, interaction);

          if (handlerResult && (handlerResult.state || handlerResult.result)) {
            return {
              type: 'ok',
              result: handlerResult.result,
              state: handlerResult.state || state
            };
          }

          // Will be caught below as unexpected exception.
          throw new Error(`Unexpected result from contract: ${JSON.stringify(handlerResult)}`);
        } catch (err) {
          switch (err.name) {
            case 'ContractError':
              return {
                type: 'error',
                result: err.message,
                state
              };
            default:
              return {
                type: 'exception',
                result: `${(err && err.stack) || (err && err.message)}`,
                state
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
      throw new Error('TODO implement');
      /*logger.debug('swGlobal.viewContractState call: %o', {
        from: contractDefinition.txId,
        to: contractTxId,
        input
      });
      return await executionContext.contract.viewStateForTx(contractTxId, input, swGlobal._activeTx);*/
    };
  }

  private assignReadContractState<Input, State>(
    swGlobal: SmartWeaveGlobal,
    contractDefinition: ContractDefinition<State>,
    executionContext: ExecutionContext<State>,
    currentTx: { interactionTxId: string; contractTxId: string }[]
  ) {
    swGlobal.contracts.readContractState = async (contractTxId: string, height?: number, returnValidity?: boolean) => {
      logger.debug('swGlobal.readContractState call: ', {
        from: contractDefinition.txId,
        to: contractTxId
      });
      const requestedHeight = height || swGlobal.block.height;
      const childContract = executionContext.smartweave.contract(contractTxId);

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
      return returnValidity ? stateWithValidity : stateWithValidity.state;
    };
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
    const [SmartWeave, BigNumber, clarity] = arguments;
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
  result: string | Result;
  state: State;
};

export type InteractionResult<State, Result> = HandlerResult<State, Result> & {
  type: 'ok' | 'error' | 'exception';
};

export type ContractInteraction<Input> = {
  input: Input;
  caller: string;
};
