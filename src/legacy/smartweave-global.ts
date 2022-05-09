/* eslint-disable */
import Arweave from 'arweave';
import { GQLNodeInterface, GQLTagInterface } from './gqlResult';
import {EvaluationOptions} from "@smartweave/core";

/**
 *
 * This class is be exposed as a global for contracts
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
    this.arweave.wallets.getBalance = async (address: string): Promise<string> => {
      if (!this._activeTx) {
        throw new Error("Cannot read balance - active tx is not set.");
      }
      if (!this.block.height) {
        throw new Error("Cannot read balance - block height not set.")
      }
      console.log(`${evaluationOptions.walletBalanceUrl}block/height/${this.block.height}/wallet/${address}/balance`);

      // http://nyc-1.dev.arweave.net:1984/block/height/914387/wallet/M-mpNeJbg9h7mZ-uHaNsa5jwFFRAq0PsTkNWXJ-ojwI/balance
      return await fetch(`${evaluationOptions.walletBalanceUrl}block/height/${this.block.height}/wallet/${address}/balance`)
        .then((res) => {
          return res.ok ? res.text() : Promise.reject(res);
        })
        .catch((error) => {
          throw new Error(`Unable to read wallet balance. ${error.status}. ${error.body?.message}`);
        });
    }
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

      write: (contractId: string, input: any) => {
        throw new Error('Not implemented - should be set by HandlerApi implementor');
      },

      refreshState: () => {
        throw new Error('Not implemented - should be set by HandlerApi implementor');
      }
    };

    this.useGas = this.useGas.bind(this);
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
}

// tslint:disable-next-line: max-classes-per-file
class Transaction {
  constructor(private readonly global: SmartWeaveGlobal) {}

  get id() {
    if (!this.global._activeTx) {
      throw new Error('No current Tx');
    }
    return this.global._activeTx.id;
  }

  get owner() {
    if (!this.global._activeTx) {
      throw new Error('No current Tx');
    }
    return this.global._activeTx.owner.address;
  }

  get target() {
    if (!this.global._activeTx) {
      throw new Error('No current Tx');
    }
    return this.global._activeTx.recipient;
  }

  get tags(): GQLTagInterface[] {
    if (!this.global._activeTx) {
      throw new Error('No current Tx');
    }
    return this.global._activeTx.tags;
  }

  get quantity() {
    if (!this.global._activeTx) {
      throw new Error('No current Tx');
    }
    return this.global._activeTx.quantity.winston;
  }

  get reward() {
    if (!this.global._activeTx) {
      throw new Error('No current Tx');
    }
    return this.global._activeTx.fee.winston;
  }
}

// tslint:disable-next-line: max-classes-per-file
class Block {
  constructor(private readonly global: SmartWeaveGlobal) {}

  get height() {
    if (!this.global._activeTx) {
      throw new Error('No current Tx');
    }
    return this.global._activeTx.block.height;
  }

  get indep_hash() {
    if (!this.global._activeTx) {
      throw new Error('No current Tx');
    }
    return this.global._activeTx.block.id;
  }

  get timestamp() {
    if (!this.global._activeTx) {
      throw new Error('No current tx');
    }
    return this.global._activeTx.block.timestamp;
  }
}
