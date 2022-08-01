import { SortKeyCache, CacheKey, SortKeyCacheResult } from '../SortKeyCache';
import { CacheOptions, LoggerFactory } from '@warp';
import { Level } from 'level';
import { MemoryLevel } from 'memory-level';

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
export class LevelDbCache<V = any> implements SortKeyCache<V> {
  private readonly logger = LoggerFactory.INST.create('LevelDbCache');

  /**
   * not using the Level type, as it is not compatible with MemoryLevel (i.e. has more properties)
   * and there doesn't seem to be any public interface/abstract type for all Level implementations
   * (the AbstractLevel is not exported from the package...)
   */
  private db: MemoryLevel;

  constructor(cacheOptions: CacheOptions) {
    if (cacheOptions.inMemory) {
      this.db = new MemoryLevel({ valueEncoding: 'json' });
    } else {
      if (!cacheOptions.dbLocation) {
        throw new Error('LevelDb cache configuration error - no db location specified');
      }
      const dbLocation = cacheOptions.dbLocation;
      this.logger.info(`Using location ${dbLocation}`);
      this.db = new Level<string, any>(dbLocation, { valueEncoding: 'json' });
    }
  }

  async get(contractTxId: string, sortKey: string, returnDeepCopy?: boolean): Promise<SortKeyCacheResult<V> | null> {
    const contractCache = this.db.sublevel<string, any>(contractTxId, { valueEncoding: 'json' });

    try {
      const result = await contractCache.get(sortKey);

      return {
        sortKey: sortKey,
        cachedValue: result
      };
    } catch (e: any) {
      if (e.code == 'LEVEL_NOT_FOUND') {
        return null;
      } else {
        throw e;
      }
    }
  }

  async getLast(contractTxId: string): Promise<SortKeyCacheResult<V> | null> {
    const contractCache = this.db.sublevel<string, any>(contractTxId, { valueEncoding: 'json' });
    const keys = await contractCache.keys({ reverse: true, limit: 1 }).all();
    if (keys.length) {
      return {
        sortKey: keys[0],
        cachedValue: await contractCache.get(keys[0])
      };
    } else {
      return null;
    }
  }

  async getLessOrEqual(contractTxId: string, sortKey: string): Promise<SortKeyCacheResult<V> | null> {
    const contractCache = this.db.sublevel<string, any>(contractTxId, { valueEncoding: 'json' });
    const keys = await contractCache.keys({ reverse: true, lte: sortKey, limit: 1 }).all();
    if (keys.length) {
      return {
        sortKey: keys[0],
        cachedValue: await contractCache.get(keys[0])
      };
    } else {
      return null;
    }
  }

  async put(stateCacheKey: CacheKey, value: V): Promise<void> {
    const contractCache = this.db.sublevel<string, any>(stateCacheKey.contractTxId, { valueEncoding: 'json' });
    await contractCache.put(stateCacheKey.sortKey, value);
  }

  close(): Promise<void> {
    return this.db.close();
  }

  async dump(): Promise<any> {
    const result = await this.db.iterator().all();
    return result;
  }

  // TODO: this implementation is sub-optimal
  // the lastSortKey should be probably memoized during "put"
  async getLastSortKey(): Promise<string | null> {
    let lastSortKey = '';
    const keys = await this.db.keys().all();

    for (const key of keys) {
      // default key format used by sub-levels:
      // !<contract_tx_id (43 chars)>!<sort_key>
      const sortKey = key.substring(45);
      if (sortKey.localeCompare(lastSortKey) > 0) {
        lastSortKey = sortKey;
      }
    }

    return lastSortKey == '' ? null : lastSortKey;
  }

  async allContracts(): Promise<string[]> {
    const keys = await this.db.keys().all();

    const result = new Set<string>();
    keys.forEach((k) => result.add(k.substring(1, 44)));

    return Array.from(result);
  }
}
