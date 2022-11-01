import { CacheKey, SortKeyCache, SortKeyCacheResult } from '../SortKeyCache';
import { CacheOptions } from '../../core/WarpFactory';
import { LoggerFactory } from '../../logging/LoggerFactory';
import { open, RootDatabase } from 'lmdb';
import { lastPossibleKey } from '../../core/modules/impl/LexicographicalInteractionsSorter';

/**
 * The LevelDB is a lexicographically sorted key-value database - so it's ideal for this use case
 * - as it simplifies cache look-ups (e.g. lastly stored value or value "lower-or-equal" than given sortKey).
 * The cache for contracts are implemented as sub-levels - https://www.npmjs.com/package/level#sublevel--dbsublevelname-options.
 *
 * The default location for the node.js cache is ./cache/warp.
 * The default name for the browser IndexedDB cache is warp-cache
 */
export class LmdbCache<V = any> implements SortKeyCache<V> {
  private readonly logger = LoggerFactory.INST.create('LmdbCache');

  /**
   * not using the Level type, as it is not compatible with MemoryLevel (i.e. has more properties)
   * and there doesn't seem to be any public interface/abstract type for all Level implementations
   * (the AbstractLevel is not exported from the package...)
   */
  private readonly db: RootDatabase<V, string>;

  constructor(cacheOptions: CacheOptions) {
    if (!cacheOptions.dbLocation) {
      throw new Error('LmdbCache cache configuration error - no db location specified');
    }
    const dbLocation = cacheOptions.dbLocation;
    this.logger.info(`Using location ${dbLocation}/state`);
    this.db = open<V, string>({ path: `${dbLocation}/state` });
  }

  async get(contractTxId: string, sortKey: string, returnDeepCopy?: boolean): Promise<SortKeyCacheResult<V> | null> {
    const result = this.db.get(`${contractTxId}|${sortKey}`) || null;

    return {
      sortKey: sortKey,
      cachedValue: result
    };
  }

  async getLast(contractTxId: string): Promise<SortKeyCacheResult<V> | null> {
    const result = this.db.getRange({ start: `${contractTxId}|${lastPossibleKey}`, reverse: true, limit: 1 }).asArray;
    if (result.length) {
      if (!result[0].key.startsWith(contractTxId)) {
        return null;
      }
      return {
        sortKey: result[0].key,
        cachedValue: result[0].value
      };
    } else {
      return null;
    }
  }

  async getLessOrEqual(contractTxId: string, sortKey: string): Promise<SortKeyCacheResult<V> | null> {
    const result = this.db.getRange({
      start: `${contractTxId}|${lastPossibleKey}`,
      reverse: true,
      limit: 1
    }).asArray;
    if (result.length) {
      if (!result[0].key.startsWith(contractTxId)) {
        return null;
      }
      return {
        sortKey: result[0].key,
        cachedValue: result[0].value
      };
    } else {
      return null;
    }
  }

  async put(stateCacheKey: CacheKey, value: V): Promise<void> {
    await this.db.put(`${stateCacheKey.contractTxId}|${stateCacheKey.sortKey}`, value);
  }

  close(): Promise<void> {
    return this.db.close();
  }

  async dump(): Promise<any> {
    throw new Error('Not implemented yet');
  }

  async getLastSortKey(): Promise<string | null> {
    throw new Error('Not implemented yet');
  }

  async allContracts(): Promise<string[]> {
    throw new Error('Not implemented yet');
  }
}
