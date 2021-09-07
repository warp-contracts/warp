import {
  DefinitionLoader,
  ExecutionContext,
  ExecutionContextModifier,
  ExecutorFactory,
  HandlerApi,
  LoggerFactory,
  SmartWeaveError,
  SmartWeaveErrorType
} from '@smartweave';

export interface EvolveCompatibleState {
  settings: any[]; // some..erm..settings?
  canEvolve: boolean; // whether contract is allowed to evolve. seems to default to true..
  evolve: string; // the transaction id of the Arweave transaction with the updated source code. odd naming convention..
}

/*
...I'm still not fully convinced to the whole "evolve" idea.

IMO It makes it very hard to audit what exactly the smart contract's code at given txId is doing (as it requires
to analyse its whole interactions history and verify if some of them do not modify original contract's source code).

IMO instead of using "evolve" feature - a new contract version should be deployed (with "output state"
from previous version set as "input state" for the new version).

Instead of using "evolve" feature - one could utilise the "contracts-registry" approach:
https://github.com/redstone-finance/redstone-smartweave-contracts/blob/main/src/contracts-registry/contracts-registry.contract.ts
https://viewblock.io/arweave/address/XQkGzXG6YknJyy-YbakEZvQKAWkW2_aPRhc3ShC8lyA?tab=state
- it keeps track of all the versions of the given contract and allows to retrieve the latest version by contract's "business" name -
without the need of hard-coding contract's txId in the client's source code.

This also makes it easier to audit given contract - as you keep all its versions in one place.
*/

function isEvolveCompatible(state: any): state is EvolveCompatibleState {
  if (!state) {
    return false;
  }

  const settings = evalSettings(state);

  return state.evolve !== undefined || settings.has('evolve');
}

export class Evolve implements ExecutionContextModifier {
  private readonly logger = LoggerFactory.INST.create('Evolve');

  constructor(
    private readonly definitionLoader: DefinitionLoader,
    private readonly executorFactory: ExecutorFactory<HandlerApi<unknown>>
  ) {
    this.modify = this.modify.bind(this);
  }

  async modify<State>(
    state: State,
    executionContext: ExecutionContext<State, HandlerApi<State>>
  ): Promise<ExecutionContext<State, HandlerApi<State>>> {
    const contractTxId = executionContext.contractDefinition.txId;
    this.logger.debug(`trying to evolve for: ${contractTxId}`);
    if (!isEvolveCompatible(state)) {
      this.logger.debug('State is not evolve compatible');
      return executionContext;
    }
    const currentSrcTxId = executionContext.contractDefinition.srcTxId;

    const settings = evalSettings(state);

    // note: from my understanding - this variable holds the id of the transaction with updated source code.
    const evolve: string = state.evolve || settings.get('evolve');

    let canEvolve: boolean = state.canEvolve || settings.get('canEvolve');

    // By default, contracts can evolve if there's not an explicit `false`.
    if (canEvolve === undefined || canEvolve === null) {
      canEvolve = true;
    }
    if (evolve && /[a-z0-9_-]{43}/i.test(evolve) && canEvolve) {
      this.logger.debug('Checking evolve:', {
        current: currentSrcTxId,
        evolve
      });

      if (currentSrcTxId !== evolve) {
        try {
          // note: that's really nasty IMO - loading original contract definition,
          // but forcing different sourceTxId...
          this.logger.info('Evolving to: ', evolve);
          const newContractDefinition = await this.definitionLoader.load<State>(contractTxId, evolve);
          const newHandler = (await this.executorFactory.create<State>(newContractDefinition)) as HandlerApi<State>;

          const modifiedContext = {
            ...executionContext,
            contractDefinition: newContractDefinition,
            handler: newHandler
          };
          this.logger.debug('evolved to:', {
            txId: modifiedContext.contractDefinition.txId,
            srcTxId: modifiedContext.contractDefinition.srcTxId
          });

          return modifiedContext;
        } catch (e) {
          throw new SmartWeaveError(SmartWeaveErrorType.CONTRACT_NOT_FOUND, {
            message: `Contract having txId: ${contractTxId} not found`,
            requestedTxId: contractTxId
          });
        }
      }
    }

    return executionContext;
  }
}

function evalSettings(state: any): Map<string, any> {
  // default  - empty
  let settings = new Map<string, any>();
  if (state.settings) {
    // for Iterable format
    if (isIterable(state.settings)) {
      settings = new Map<string, any>(state.settings);
      // for Object format
    } else if (isObject(state.settings)) {
      settings = new Map<string, any>(Object.entries(state.settings));
    }
  }

  return settings;
}

function isIterable(obj: unknown): boolean {
  // checks for null and undefined
  if (obj == null) {
    return false;
  }
  return typeof obj[Symbol.iterator] === 'function';
}

function isObject(obj: unknown): boolean {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj);
}
