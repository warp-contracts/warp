import { InteractionState } from './InteractionState';
import { CacheKey, SortKeyCache, SortKeyCacheResult } from '../../cache/SortKeyCache';
import { EvalStateResult } from '../../core/modules/StateEvaluator';
import { GQLNodeInterface } from '../../legacy/gqlResult';
import { Warp } from '../../core/Warp';
import { SortKeyCacheRangeOptions } from '../../cache/SortKeyCacheRangeOptions';
import { SimpleLRUCache } from '../../common/SimpleLRUCache';
import { Benchmark } from '../../logging/Benchmark';
import { LoggerFactory } from '../../logging/LoggerFactory';

export class ContractInteractionState implements InteractionState {
  private readonly _json = new Map<string, SimpleLRUCache<string, EvalStateResult<unknown>>>();
  private readonly _initialJson = new Map<string, EvalStateResult<unknown>>();
  private readonly _kv = new Map<string, SortKeyCache<unknown>>();
  private readonly logger = LoggerFactory.INST.create('ContractInteractionState');

  constructor(private readonly _warp: Warp) {}

  has(contractTx, sortKey: string): boolean {
    return this._json.get(contractTx)?.has(sortKey) || false;
  }

  get(contractTxId: string, sortKey: string): EvalStateResult<unknown> {
    return this._json.get(contractTxId)?.get(sortKey) || null;
  }

  getLessOrEqual(contractTxId: string, sortKey?: string): SortKeyCacheResult<EvalStateResult<unknown>> | null {
    const states = this._json.get(contractTxId);
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
      const latestState = new Map<string, EvalStateResult<unknown>>();
      this._json.forEach((val, k) => {
        const state = this.getLessOrEqual(k, interaction.sortKey);
        if (state != null) {
          latestState.set(k, state.cachedValue);
        }
      });
      const doStoreJsonBenchmark = Benchmark.measure();
      await this.doStoreJson(latestState, interaction, forceStore);
      doStoreJsonBenchmark.stop();
      this.logger.info('doStoreJsonBenchmark', doStoreJsonBenchmark.elapsed());
      const commitKvsBenchmark = Benchmark.measure();
      await this.commitKVs();
      commitKvsBenchmark.stop();
      this.logger.info('commitKvs', doStoreJsonBenchmark.elapsed());
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
      this.doStoreJson(this._initialJson, interaction, forceStateStoreToCache).then();
      await this.rollbackKVs();
    } finally {
      this.reset();
    }
  }

  setInitial(contractTxId: string, state: EvalStateResult<unknown>, sortKey: string): void {
    // think twice here.
    this._initialJson.set(contractTxId, state);
    this.update(contractTxId, state, sortKey);
  }

  update(contractTxId: string, state: EvalStateResult<unknown>, sortKey: string): void {
    if (!this._json.has(contractTxId)) {
      const cache = new SimpleLRUCache<string, EvalStateResult<unknown>>(10);
      this._json.set(contractTxId, cache);
    }
    this._json.get(contractTxId).set(sortKey, state);
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

  private reset(): void {
    this._json.clear();
    this._initialJson.clear();
    this._kv.clear();
  }

  private async doStoreJson(
    states: Map<string, EvalStateResult<unknown>>,
    interaction: GQLNodeInterface,
    forceStore = false
  ) {
    if (states.size > 1 || forceStore) {
      for (const [k, v] of states) {
        await this._warp.stateEvaluator.putInCache(k, interaction, v);
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
