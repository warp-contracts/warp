import { BatchDBOp, CacheKey, SortKeyCache, SortKeyCacheResult } from '../SortKeyCache';
import { Level } from 'level';
import { MemoryLevel } from 'memory-level';
import { CacheOptions } from '../../core/WarpFactory';
import { LoggerFactory } from '../../logging/LoggerFactory';
import { SortKeyCacheRangeOptions } from '../SortKeyCacheRangeOptions';
import { AbstractSublevelOptions } from 'abstract-level/types/abstract-sublevel';
import { AbstractChainedBatch } from 'abstract-level/types/abstract-chained-batch';
import { AbstractKeyIteratorOptions } from 'abstract-level/types/abstract-iterator';

/**
 * The LevelDB is a lexicographically sorted key-value database - so it's ideal for this use case
 * - as it simplifies cache look-ups (e.g. lastly stored value or value "lower-or-equal" than given sortKey).
 * The cache for contracts are implemented as sub-levels - https://www.npmjs.com/package/level#sublevel--dbsublevelname-options.
 *
 * The default location for the node.js cache is ./cache/warp.
 * The default name for the browser IndexedDB cache is warp-cache
 *
 * In order to reduce the cache size, the oldest entries are automatically pruned.
 */

class ClientValueWrapper<V> {
  constructor(readonly value: V, readonly tomb: boolean = false) {}
}

export class LevelDbCache<V> implements SortKeyCache<V> {
  private readonly ongoingTransactionMark = '$$warp-internal-transaction$$';

  private readonly logger = LoggerFactory.INST.create('LevelDbCache');
  private readonly subLevelSeparator: string;
  private readonly subLevelOptions: AbstractSublevelOptions<string, ClientValueWrapper<V>>;

  /**
   * not using the Level type, as it is not compatible with MemoryLevel (i.e. has more properties)
   * and there doesn't seem to be any public interface/abstract type for all Level implementations
   * (the AbstractLevel is not exported from the package...)
   */
  private _db: MemoryLevel<string, ClientValueWrapper<V>>;

  /**
   * Rollback batch is way of recovering kv storage state from before a failed interaction.
   * Currently, all operations performed during active transaction are directly saved to kv storage.
   * In case the transaction fails the changes will be reverted using the rollback batch.
   */
  private _rollbackBatch: AbstractChainedBatch<
    MemoryLevel<string, ClientValueWrapper<V>>,
    string,
    ClientValueWrapper<V>
  >;

  // Lazy initialization upon first access
  private get db(): MemoryLevel<string, ClientValueWrapper<V>> {
    if (!this._db) {
      if (this.cacheOptions.inMemory) {
        this._db = new MemoryLevel(this.subLevelOptions);
      } else {
        if (!this.cacheOptions.dbLocation) {
          throw new Error('LevelDb cache configuration error - no db location specified');
        }
        const dbLocation = this.cacheOptions.dbLocation;
        this.logger.info(`Using location ${dbLocation}`);
        this._db = new Level<string, ClientValueWrapper<V>>(dbLocation, this.subLevelOptions);
      }
    }
    return this._db;
  }

  constructor(private readonly cacheOptions: CacheOptions) {
    this.subLevelSeparator = cacheOptions.subLevelSeparator || '!';
    this.subLevelOptions = {
      valueEncoding: 'json',
      separator: this.subLevelSeparator
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async get(cacheKey: CacheKey, returnDeepCopy?: boolean): Promise<SortKeyCacheResult<V> | null> {
    this.validateKey(cacheKey.key);
    const contractCache = this.db.sublevel<string, ClientValueWrapper<V>>(cacheKey.key, this.subLevelOptions);
    // manually opening to fix https://github.com/Level/level/issues/221
    await contractCache.open();
    try {
      const result: ClientValueWrapper<V> = await contractCache.get(cacheKey.sortKey);
      let resultValue: V;
      if (result.tomb === undefined && result.value === undefined) {
        resultValue = result as V;
      } else {
        resultValue = result.tomb ? null : result.value;
      }
      return new SortKeyCacheResult<V>(cacheKey.sortKey, resultValue);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      if (e.code == 'LEVEL_NOT_FOUND') {
        return null;
      } else {
        throw e;
      }
    }
  }

  async getLast(key: string): Promise<SortKeyCacheResult<V> | null> {
    const contractCache = this.db.sublevel<string, ClientValueWrapper<V>>(key, this.subLevelOptions);
    // manually opening to fix https://github.com/Level/level/issues/221
    await contractCache.open();
    const keys = await contractCache.keys({ reverse: true, limit: 1 }).all();
    if (keys.length) {
      const lastValueWrap = await contractCache.get(keys[0]);
      if (lastValueWrap.tomb === undefined && lastValueWrap.value === undefined) {
        return new SortKeyCacheResult<V>(keys[0], lastValueWrap as V);
      }
      if (!lastValueWrap.tomb) {
        return new SortKeyCacheResult<V>(keys[0], lastValueWrap.value);
      }
    }
    return null;
  }

  async getLessOrEqual(key: string, sortKey: string): Promise<SortKeyCacheResult<V> | null> {
    const contractCache = this.db.sublevel<string, ClientValueWrapper<V>>(key, this.subLevelOptions);
    // manually opening to fix https://github.com/Level/level/issues/221
    await contractCache.open();
    const keys = await contractCache.keys({ reverse: true, lte: sortKey, limit: 1 }).all();
    if (keys.length) {
      const cachedVal = await contractCache.get(keys[0]);
      if (!cachedVal.tomb) {
        return new SortKeyCacheResult<V>(keys[0], cachedVal.value);
      }
    }
    return null;
  }

  async put(stateCacheKey: CacheKey, value: V): Promise<void> {
    await this.setClientValue(stateCacheKey, new ClientValueWrapper(value));
  }

  /**
   * Delete operation under the hood is a write operation with setting tomb flag to true.
   * The idea behind is based on Cassandra Tombstone
   * https://www.instaclustr.com/support/documentation/cassandra/using-cassandra/managing-tombstones-in-cassandra/
   * There is a couple of benefits to this approach:
   * This allows to use kv storage range operations with ease.
   * The value will not be accessible only to the next interactions. Interactions reading state for lower sortKey will be able to access it.
   * Revert operation for rollback is much easier to implement
   */
  async del(cacheKey: CacheKey): Promise<void> {
    await this.setClientValue(cacheKey, new ClientValueWrapper(null, true));
  }

  private async setClientValue(stateCacheKey: CacheKey, valueWrapper: ClientValueWrapper<V>): Promise<void> {
    this.validateKey(stateCacheKey.key);
    const contractCache = this.db.sublevel<string, ClientValueWrapper<V>>(stateCacheKey.key, this.subLevelOptions);
    // manually opening to fix https://github.com/Level/level/issues/221
    await contractCache.open();
    await contractCache.put(stateCacheKey.sortKey, valueWrapper);
    if (this._rollbackBatch) {
      this._rollbackBatch.del(stateCacheKey.sortKey, { sublevel: contractCache });
    }
  }

  async delete(key: string): Promise<void> {
    const contractCache = this.db.sublevel<string, ClientValueWrapper<V>>(key, this.subLevelOptions);
    await contractCache.open();
    await contractCache.clear();
  }

  async batch(opStack: BatchDBOp<V>[]) {
    for (const op of opStack) {
      if (op.type === 'put') {
        await this.put(op.key, op.value);
      } else if (op.type === 'del') {
        await this.delete(op.key);
      }
    }
  }

  async open(): Promise<void> {
    await this.db.open();
  }

  async close(): Promise<void> {
    if (this._db) {
      await this._db.close();
    }
  }

  async begin(): Promise<void> {
    await this.initRollbackBatch();
  }

  async rollback() {
    if (this._rollbackBatch) {
      this._rollbackBatch.del(this.ongoingTransactionMark);
      await this._rollbackBatch.write();
      await this._rollbackBatch.close();
    }
    this._rollbackBatch = null;
  }

  private async initRollbackBatch(): Promise<
    AbstractChainedBatch<MemoryLevel<string, ClientValueWrapper<V>>, string, ClientValueWrapper<V>>
  > {
    if (this._rollbackBatch == null) {
      await this.checkPreviousTransactionFinished();
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await this.db.put(this.ongoingTransactionMark, 'ongoing');

      this._rollbackBatch = this.db.batch();
    }
    return this._rollbackBatch;
  }

  private async checkPreviousTransactionFinished() {
    let transactionMarkValue;

    try {
      transactionMarkValue = await this.db.get(this.ongoingTransactionMark);
      // eslint-disable-next-line no-empty
    } catch (error) {}

    if (transactionMarkValue == 'ongoing') {
      throw new Error(`Database seems to be in inconsistent state. The previous transaction has not finished.`);
    }
  }

  async commit() {
    if (this._rollbackBatch) {
      await this._rollbackBatch.clear();
      await this.db.del(this.ongoingTransactionMark);
      await this._rollbackBatch.close();
    }
    this._rollbackBatch = null;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async dump(): Promise<any> {
    const result = await this.db.iterator().all();
    return result;
  }

  // TODO: this implementation is sub-optimal
  // the lastSortKey should be probably memoized during "put"
  async getLastSortKey(): Promise<string | null> {
    let lastSortKey = '';
    await this.db.open();
    const keys = await this.db.keys().all();

    for (const joinedKey of keys) {
      // default joined key format used by sub-levels:
      // <separator><contract_tx_id (43 chars)><separator><sort_key>
      const sortKey = joinedKey.split(this.subLevelSeparator)[1];
      if (sortKey.localeCompare(lastSortKey) > 0) {
        lastSortKey = sortKey;
      }
    }

    return lastSortKey == '' ? null : lastSortKey;
  }

  async keys(sortKey?: string, options?: SortKeyCacheRangeOptions): Promise<string[]> {
    return Array.from((await this.kvMap(sortKey, options)).keys());
  }

  validateKey(key: string) {
    if (key.includes(this.ongoingTransactionMark)) {
      throw new Error(`Validation error: Key ${key} for internal use only`);
    }
    if (key.includes(this.subLevelSeparator)) {
      throw new Error(`Validation error: key ${key} contains db separator ${this.subLevelSeparator}`);
    }
  }

  extractOriginalKey(joinedKey: string): string {
    return joinedKey.split(this.subLevelSeparator)[1];
  }

  extractSortKey(joinedKey: string): string {
    return joinedKey.split(this.subLevelSeparator)[2];
  }

  async kvMap(sortKey: string, options?: SortKeyCacheRangeOptions): Promise<Map<string, V>> {
    const result: Map<string, V> = new Map();
    const allKeys = (await this.db.keys(this.levelRangeOptions(options)).all())
      .filter((k) => !sortKey || this.extractSortKey(k).localeCompare(sortKey) <= 0)
      .map((k) => this.extractOriginalKey(k));

    for (const k of allKeys) {
      const lastValue = await this.getLessOrEqual(k, sortKey);
      if (lastValue) {
        result.set(k, lastValue.cachedValue);
      }
    }

    if (options?.limit) {
      const limitedResult: Map<string, V> = new Map();
      for (const item of Array.from(result.entries()).slice(0, options.limit)) {
        limitedResult.set(item[0], item[1]);
      }
      return limitedResult;
    }

    return result;
  }

  private levelRangeOptions(options?: SortKeyCacheRangeOptions): AbstractKeyIteratorOptions<string> {
    const rangeOptions: AbstractKeyIteratorOptions<string> = {
      reverse: options?.reverse
    };

    if (options?.gte) {
      rangeOptions.gte = this.subLevelSeparator + options.gte;
    }

    if (options?.lt) {
      rangeOptions.lt = this.subLevelSeparator + options.lt;
    }

    return rangeOptions;
  }

  storage<S>(): S {
    return this.db as S;
  }

  async getNumEntries(): Promise<number> {
    const keys = await this.db.keys().all();
    return keys.length;
  }

  /**
   Let's assume that given contract cache contains these sortKeys: [a, b, c, d, e, f]
   Let's assume entriesStored = 2
   After pruning, the cache should be left with these keys: [e,f].

   const entries = await contractCache.keys({ reverse: true, limit: entriesStored }).all();
   This would return in this case entries [f, e] (notice the "reverse: true").

   await contractCache.clear({ lt: entries[entries.length - 1] });
   This effectively means: await contractCache.clear({ lt: e });
   -> hence the entries [a,b,c,d] are removed and left are the [e,f]
  */
  async prune(entriesStored = 5): Promise<null> {
    if (!entriesStored || entriesStored <= 0) {
      entriesStored = 1;
    }

    const contracts = await this.keys();
    for (let i = 0; i < contracts.length; i++) {
      const contractCache = this.db.sublevel<string, ClientValueWrapper<V>>(contracts[i], this.subLevelOptions);

      // manually opening to fix https://github.com/Level/level/issues/221
      await contractCache.open();

      // Get keys that will be left, just to get the last one of them
      const entries = await contractCache.keys({ reverse: true, limit: entriesStored }).all();
      if (!entries || entries.length < entriesStored) {
        continue;
      }
      await contractCache.clear({ lt: entries[entries.length - 1] });
      await contractCache.close();
    }

    return null;
  }
}
