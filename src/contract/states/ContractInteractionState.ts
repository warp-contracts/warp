import { InteractionState, InteractionStateSnapshot } from './InteractionState';
import { CacheKey, SortKeyCache } from '../../cache/SortKeyCache';
import { EvalStateResult } from '../../core/modules/StateEvaluator';
import { GQLNodeInterface } from '../../legacy/gqlResult';
import { Warp } from '../../core/Warp';
import { SortKeyCacheRangeOptions } from '../../cache/SortKeyCacheRangeOptions';

export class ContractInteractionState implements InteractionState {
  private readonly _json = new Map<string, InteractionStateSnapshot>();
  private readonly _initialJson = new Map<string, EvalStateResult<unknown>>();
  private readonly _kv = new Map<string, SortKeyCache<unknown>>();

  constructor(private readonly _warp: Warp) {}

  has(contractTx, sortKey: string): boolean {
    const snapshot = this._json.get(contractTx);
    return snapshot != null && sortKey >= snapshot.validFrom && sortKey <= snapshot.validTo;
  }

  get(contractTxId: string, sortKey: string): EvalStateResult<unknown> {
    if (this.has(contractTxId, sortKey)) {
      return this._json.get(contractTxId).state;
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

  async commit(interaction: GQLNodeInterface): Promise<void> {
    if (interaction.dry) {
      await this.rollbackKVs();
      return this.reset();
    }
    try {
      await this.doStoreSnapshot(this._json, interaction);
      await this.commitKVs();
    } finally {
      this.reset();
    }
  }

  async commitKV(): Promise<void> {
    await this.commitKVs();
    this._kv.clear();
  }

  async rollback(interaction: GQLNodeInterface): Promise<void> {
    try {
      await this.doStoreJson(this._initialJson, interaction);
      await this.rollbackKVs();
    } finally {
      this.reset();
    }
  }

  setInitial(contractTxId: string, snapshot: InteractionStateSnapshot): void {
    // think twice here.
    this._initialJson.set(contractTxId, snapshot.state);
    this.update(contractTxId, snapshot);
  }

  update(contractTxId: string, snapshot: InteractionStateSnapshot): void {
    if (snapshot.validTo != null && snapshot.validFrom != null) {
      this._json.set(contractTxId, snapshot);
    }
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

  private async doStoreJson(states: Map<string, EvalStateResult<unknown>>, interaction: GQLNodeInterface) {
    if (states.size > 1) {
      for (const [k, v] of states) {
        await this._warp.stateEvaluator.putInCache(k, interaction, v);
      }
    }
  }

  private async doStoreSnapshot(snapshots: Map<string, InteractionStateSnapshot>, interaction: GQLNodeInterface) {
    if (snapshots.size > 1) {
      for (const [k, v] of snapshots) {
        await this._warp.stateEvaluator.putInCache(k, interaction, v.state);
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
