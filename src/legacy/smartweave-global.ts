/* eslint-disable */
import Arweave from 'arweave';
import { EvaluationOptions } from '../core/modules/StateEvaluator';
import { GQLNodeInterface, GQLTagInterface, VrfData } from './gqlResult';
import { BatchDBOp, CacheKey, PutBatch, SortKeyCache } from '../cache/SortKeyCache';
 import {InteractionState} from "../contract/states/InteractionState";

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
  transaction: SWTransaction;
  block: SWBlock;
  vrf: SWVrf;
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

  extensions: any;

  _activeTx?: GQLNodeInterface;

  caller?: string;

  kv: KV;

  constructor(
    arweave: Arweave,
    contract: { id: string; owner: string },
    evaluationOptions: EvaluationOptions,
    interactionState: InteractionState,
    storage: SortKeyCache<any> | null
  ) {
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
    this.transaction = new SWTransaction(this);
    this.block = new SWBlock(this);
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
    this.vrf = new SWVrf(this);

    this.useGas = this.useGas.bind(this);
    this.getBalance = this.getBalance.bind(this);

    this.extensions = {};

    this.kv = new KV(storage, interactionState, this.transaction, this.contract.id);
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
export class SWTransaction {
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

  get sortKey(): string {
    if (!this.smartWeaveGlobal._activeTx) {
      throw new Error('No current Tx');
    }
    return this.smartWeaveGlobal._activeTx.sortKey;
  }

  get dryRun(): boolean {
    if (!this.smartWeaveGlobal._activeTx) {
      throw new Error('No current Tx');
    }
    return this.smartWeaveGlobal._activeTx.dry === true;
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
export class SWBlock {
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

export class SWVrf {
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

export class KV {
  private _kvBatch: BatchDBOp<any>[] = [];

  constructor(
    private readonly _storage: SortKeyCache<any> | null,
    private readonly _interactionState: InteractionState,
    private readonly _transaction: SWTransaction,
    private readonly _contractTxId: string) {}

  async put(key: string, value: any): Promise<void> {
    this.checkStorageAvailable();
    this._kvBatch.push({
      type: 'put',
      key: new CacheKey(key, this._transaction.sortKey),
      value: value
    });
  }

  async get<V>(key: string): Promise<V | null> {
    this.checkStorageAvailable();
    const sortKey = this._transaction.sortKey;

    // first we're checking if the value exists in changes registered for the activeTx
    if (this._kvBatch.length > 0) {
      const activeTxValue = this.findInBatches<V>(this._kvBatch, key, sortKey);
      if (activeTxValue !== undefined) {
        return activeTxValue;
      }
    }

    // then we're checking if the values exists in the interactionState
    const interactionStateBatch = this._interactionState.getKV(this._contractTxId);
    if (interactionStateBatch?.length > 0) {
      const interactionStateValue = this.findInBatches<V>(interactionStateBatch, key, sortKey);
      if (interactionStateValue !== undefined) {
        return interactionStateValue;
      }
    }

    const result = await this._storage.getLessOrEqual(key, this._transaction.sortKey);
    return result?.cachedValue || null;
  }

  private findInBatches<V>(batches: BatchDBOp<any>[], key: string, sortKey: string): V | undefined {
    const putBatches = batches.filter((batchOp) => batchOp.type === 'put') as PutBatch<any>[];
    const matchingPutBatch = putBatches.reverse().find((batchOp) => {
      return batchOp.key.key === key && batchOp.key.sortKey === sortKey;
    }) as PutBatch<V>;

    return matchingPutBatch?.value;
  }

  async commit(): Promise<void> {
    if (this._storage) {
      this._interactionState.updateKV(this._contractTxId, [...this._kvBatch])
      this._kvBatch = [];
    }
  }

  rollback(): void {
    this._kvBatch = [];
  }

  ops(): BatchDBOp<any>[] {
    return structuredClone(this._kvBatch);
  }

  open(): Promise<void> {
    if (this._storage) {
      return this._storage.open();
    }
  }

  close(): Promise<void> {
    if (this._storage) {
      return this._storage.close();
    }
  }

  private checkStorageAvailable() {
    if (!this._storage) {
      throw new Error('KV Storage not available');
    }
  }
}
