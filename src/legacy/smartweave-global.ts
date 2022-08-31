/* eslint-disable */
import Arweave from 'arweave';
import { EvaluationOptions } from '../core/modules/StateEvaluator';
import { GQLNodeInterface, GQLTagInterface, VrfData } from './gqlResult';

/**
 *
 * This class is exposed as a global for contracts
 * as 'SmartWeave' and provides an API for getting further
 * information or using utility and crypto functions from
 * inside the contracts execution.
 *
 * It provides an api:
 *
 * - SmartWeave.transaction.id
 * - SmartWeave.transaction.reward
 * - SmartWeave.block.height
 * - SmartWeave.block.timestamp
 * - etc
 *
 * and access to some of the arweave utils:
 * - SmartWeave.arweave.utils
 * - SmartWeave.arweave.crypto
 * - SmartWeave.arweave.wallets
 * - SmartWeave.arweave.ar
 *
 * as well as access to the potentially non-deterministic full client:
 * - SmartWeave.unsafeClient
 *
 */

export class SmartWeaveGlobal {
  gasUsed: number;
  gasLimit: number;
  transaction: Transaction;
  block: Block;
  vrf: Vrf;
  evaluationOptions: EvaluationOptions;
  arweave: Pick<Arweave, 'ar' | 'wallets' | 'utils' | 'crypto'>;
  contract: {
    id: string;
    owner: string;
  };
  unsafeClient: Arweave;

  contracts: {
    readContractState: (contractId: string) => Promise<any>;
    viewContractState: (contractId: string, input: any) => Promise<any>;
    write: (contractId: string, input: any) => Promise<any>;
    refreshState: () => Promise<any>;
  };

  _activeTx?: GQLNodeInterface;

  caller?: string;

  constructor(arweave: Arweave, contract: { id: string; owner: string }, evaluationOptions: EvaluationOptions) {
    this.gasUsed = 0;
    this.gasLimit = Number.MAX_SAFE_INTEGER;
    this.unsafeClient = arweave;
    this.arweave = {
      ar: arweave.ar,
      utils: arweave.utils,
      wallets: arweave.wallets,
      crypto: arweave.crypto
    };

    this.evaluationOptions = evaluationOptions;

    this.contract = contract;
    this.transaction = new Transaction(this);
    this.block = new Block(this);
    this.contracts = {
      readContractState: (contractId: string, height?: number, returnValidity?: boolean) => {
        throw new Error('Not implemented - should be set by HandlerApi implementor');
      },

      viewContractState: (contractId: string, input: any) => {
        throw new Error('Not implemented - should be set by HandlerApi implementor');
      },

      write: (contractId: string, input: any, throwOnError?: boolean) => {
        throw new Error('Not implemented - should be set by HandlerApi implementor');
      },

      refreshState: () => {
        throw new Error('Not implemented - should be set by HandlerApi implementor');
      }
    };
    this.vrf = new Vrf(this);

    this.useGas = this.useGas.bind(this);
    this.getBalance = this.getBalance.bind(this);
  }

  useGas(gas: number) {
    if (gas < 0) {
      throw new Error(`[RE:GNE] Gas number exception - gas < 0.`);
    }
    this.gasUsed += gas;
    if (this.gasUsed > this.gasLimit) {
      throw new Error(`[RE:OOG] Out of gas! Used: ${this.gasUsed}, limit: ${this.gasLimit}`);
    }
  }

  async getBalance(address: string, height?: number): Promise<string> {
    if (!this._activeTx) {
      throw new Error('Cannot read balance - active tx is not set.');
    }
    if (!this.block.height) {
      throw new Error('Cannot read balance - block height not set.');
    }

    const effectiveHeight = height || this.block.height;

    // http://nyc-1.dev.arweave.net:1984/block/height/914387/wallet/M-mpNeJbg9h7mZ-uHaNsa5jwFFRAq0PsTkNWXJ-ojwI/balance
    return await fetch(
      `${this.evaluationOptions.walletBalanceUrl}block/height/${effectiveHeight}/wallet/${address}/balance`
    )
      .then((res) => {
        return res.ok ? res.text() : Promise.reject(res);
      })
      .catch((error) => {
        throw new Error(`Unable to read wallet balance. ${error.status}. ${error.body?.message}`);
      });
  }
}

// tslint:disable-next-line: max-classes-per-file
class Transaction {
  constructor(private readonly smartWeaveGlobal: SmartWeaveGlobal) {}

  get id() {
    if (!this.smartWeaveGlobal._activeTx) {
      throw new Error('No current Tx');
    }
    return this.smartWeaveGlobal._activeTx.id;
  }

  get owner() {
    if (!this.smartWeaveGlobal._activeTx) {
      throw new Error('No current Tx');
    }
    return this.smartWeaveGlobal._activeTx.owner.address;
  }

  get target() {
    if (!this.smartWeaveGlobal._activeTx) {
      throw new Error('No current Tx');
    }
    return this.smartWeaveGlobal._activeTx.recipient;
  }

  get tags(): GQLTagInterface[] {
    if (!this.smartWeaveGlobal._activeTx) {
      throw new Error('No current Tx');
    }
    return this.smartWeaveGlobal._activeTx.tags;
  }

  get quantity() {
    if (!this.smartWeaveGlobal._activeTx) {
      throw new Error('No current Tx');
    }
    return this.smartWeaveGlobal._activeTx.quantity.winston;
  }

  get reward() {
    if (!this.smartWeaveGlobal._activeTx) {
      throw new Error('No current Tx');
    }
    return this.smartWeaveGlobal._activeTx.fee.winston;
  }
}

// tslint:disable-next-line: max-classes-per-file
class Block {
  constructor(private readonly smartWeaveGlobal: SmartWeaveGlobal) {}

  get height() {
    if (!this.smartWeaveGlobal._activeTx) {
      throw new Error('No current Tx');
    }
    return this.smartWeaveGlobal._activeTx.block.height;
  }

  get indep_hash() {
    if (!this.smartWeaveGlobal._activeTx) {
      throw new Error('No current Tx');
    }
    return this.smartWeaveGlobal._activeTx.block.id;
  }

  get timestamp() {
    if (!this.smartWeaveGlobal._activeTx) {
      throw new Error('No current tx');
    }
    return this.smartWeaveGlobal._activeTx.block.timestamp;
  }
}

class Vrf {
  constructor(private readonly smartWeaveGlobal: SmartWeaveGlobal) {}

  get data(): VrfData {
    return this.smartWeaveGlobal._activeTx.vrf;
  }

  // returns the original generated random number as a BigInt string;
  get value(): string {
    return this.smartWeaveGlobal._activeTx.vrf.bigint;
  }

  // returns a random value in a range from 1 to maxValue
  randomInt(maxValue: number): number {
    if (!Number.isInteger(maxValue)) {
      throw new Error('Integer max value required for random integer generation');
    }
    const result = (BigInt(this.smartWeaveGlobal._activeTx.vrf.bigint) % BigInt(maxValue)) + BigInt(1);

    if (result > Number.MAX_SAFE_INTEGER || result < Number.MIN_SAFE_INTEGER) {
      throw new Error('Random int cannot be cast to number');
    }

    return Number(result);
  }
}
