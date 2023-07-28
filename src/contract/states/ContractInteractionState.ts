import { InteractionState } from './InteractionState';
import { CacheKey, SortKeyCache, SortKeyCacheResult } from '../../cache/SortKeyCache';
import { EvalStateResult } from '../../core/modules/StateEvaluator';
import { GQLNodeInterface } from '../../legacy/gqlResult';
import { Warp } from '../../core/Warp';
import { SortKeyCacheRangeOptions } from '../../cache/SortKeyCacheRangeOptions';
import { SimpleLRUCache } from '../../common/SimpleLRUCache';

export class ContractInteractionState implements InteractionState {
  private readonly _uncommittedStates = new Map<string, SimpleLRUCache<string, EvalStateResult<unknown>>>();
  private readonly _rollbackStates = new Map<string, SortKeyCacheResult<EvalStateResult<unknown>>>();
  private readonly _kv = new Map<string, SortKeyCache<unknown>>();

  constructor(private readonly _warp: Warp) {}

  has(contractTx, sortKey: string): boolean {
    return this._uncommittedStates.get(contractTx)?.has(sortKey) || false;
  }

  get(contractTxId: string, sortKey: string): EvalStateResult<unknown> {
    return this._uncommittedStates.get(contractTxId)?.get(sortKey) || null;
  }

  getLessOrEqual(contractTxId: string, sortKey?: string): SortKeyCacheResult<EvalStateResult<unknown>> | null {
    const states = this._uncommittedStates.get(contractTxId);
    if (states != null && states.size() > 0) {
      let keys = states.keys();
      if (sortKey) {
        keys = keys.filter((k) => k.localeCompare(sortKey) <= 0);
      }
      keys = keys.sort((a, b) => a.localeCompare(b));
      const resultSortKey = keys[keys.length - 1];
      if (states.get(resultSortKey)) {
        return new SortKeyCacheResult<EvalStateResult<unknown>>(resultSortKey, states.get(resultSortKey));
      }
    }
    return null;
  }

  async getKV(contractTxId: string, cacheKey: CacheKey): Promise<unknown> {
    if (this._kv.has(contractTxId)) {
      return (await this._kv.get(contractTxId).get(cacheKey))?.cachedValue || null;
    }
    return null;
  }

  async delKV(contractTxId: string, cacheKey: CacheKey): Promise<void> {
    if (this._kv.has(contractTxId)) {
      await this._kv.get(contractTxId).del(cacheKey);
    }
  }

  getKvKeys(contractTxId: string, sortKey?: string, options?: SortKeyCacheRangeOptions): Promise<string[]> {
    const storage = this._warp.kvStorageFactory(contractTxId);
    return storage.keys(sortKey, options);
  }

  getKvRange(
    contractTxId: string,
    sortKey?: string,
    options?: SortKeyCacheRangeOptions
  ): Promise<Map<string, unknown>> {
    const storage = this._warp.kvStorageFactory(contractTxId);
    return storage.kvMap(sortKey, options);
  }

  async commit(interaction: GQLNodeInterface, forceStore = false): Promise<void> {
    if (interaction.dry) {
      await this.rollbackKVs();
      return this.reset();
    }
    try {
      const latestStates = new Map<string, SortKeyCacheResult<EvalStateResult<unknown>>>();
      this._uncommittedStates.forEach((val, k) => {
        const state = this.getLessOrEqual(k, interaction.sortKey);
        if (state != null) {
          latestStates.set(k, state);
        }
      });
      await this.doStoreStates(latestStates, interaction, forceStore);
      await this.commitKVs();
    } finally {
      this.reset();
    }
  }

  async commitKV(): Promise<void> {
    await this.commitKVs();
    this._kv.clear();
  }

  async rollback(interaction: GQLNodeInterface, forceStateStoreToCache: boolean): Promise<void> {
    try {
      await this.doStoreStates(this._rollbackStates, interaction, forceStateStoreToCache);
      await this.rollbackKVs();
    } finally {
      this.reset();
    }
  }

  setRollbackState(contractTxId: string, state: EvalStateResult<unknown>, sortKey: string): void {
    this._rollbackStates.set(contractTxId, new SortKeyCacheResult<EvalStateResult<unknown>>(sortKey, state));
  }

  update(contractTxId: string, state: EvalStateResult<unknown>, sortKey: string): void {
    if (!this._uncommittedStates.has(contractTxId)) {
      const cache = new SimpleLRUCache<string, EvalStateResult<unknown>>(10);
      this._uncommittedStates.set(contractTxId, cache);
    }
    this._uncommittedStates.get(contractTxId).set(sortKey, state);
  }

  async updateKV(contractTxId: string, key: CacheKey, value: unknown): Promise<void> {
    await (await this.getOrInitKvStorage(contractTxId)).put(key, value);
  }

  private async getOrInitKvStorage(contractTxId: string): Promise<SortKeyCache<unknown>> {
    if (this._kv.has(contractTxId)) {
      return this._kv.get(contractTxId);
    }
    const storage = this._warp.kvStorageFactory(contractTxId);
    this._kv.set(contractTxId, storage);
    await storage.open();
    return storage;
  }

  reset(): void {
    this._uncommittedStates.clear();
    this._rollbackStates.clear();
    this._kv.clear();
  }

  private async doStoreStates(
    states: Map<string, SortKeyCacheResult<EvalStateResult<unknown>>>,
    interaction: GQLNodeInterface,
    forceStore = false
  ) {
    if (states.size > 1 || forceStore) {
      for (const [k, v] of states) {
        await this._warp.stateEvaluator.putInCache(k, interaction.dry, v.cachedValue, v.sortKey);
      }
    }
  }

  private async rollbackKVs(): Promise<void> {
    for (const storage of this._kv.values()) {
      try {
        await storage.rollback();
      } finally {
        await storage.close();
      }
    }
  }

  private async commitKVs(): Promise<void> {
    for (const storage of this._kv.values()) {
      try {
        await storage.commit();
      } finally {
        await storage.close();
      }
    }
  }
}
