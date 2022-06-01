import { SortKeySwCache, StateCacheKey, SortKeyCacheResult } from '../SortKeySwCache';
import { CacheOptions, isNode, LoggerFactory } from '@smartweave';
import { Level } from 'level';

export class LevelDbCache<V = any> implements SortKeySwCache<V> {
  private readonly logger = LoggerFactory.INST.create('LevelDbCache');

  private db: Level;
  private maxStoredTransactions: number;

  constructor(cacheOptions: CacheOptions) {
    let dbLocation = cacheOptions.dbLocation;
    this.logger.info(`Using location ${dbLocation}`);
    if (!dbLocation) {
      if (isNode()) {
        dbLocation = `./cache/warp`;
      } else {
        // this is effectively IndexedDB browser db
        dbLocation = 'warp-cache';
      }
    }

    this.db = new Level<string, any>(dbLocation, { valueEncoding: 'json' });
    this.maxStoredTransactions = cacheOptions.maxStoredTransactions;
  }

  async contains(contractTxId: string): Promise<boolean> {
    // const contractCache = this.db.sublevel<string, any>(contractTxId, { valueEncoding: 'json' });
    return true;
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

  async put(stateCacheKey: StateCacheKey, value: V): Promise<void> {
    const contractCache = this.db.sublevel<string, any>(stateCacheKey.contractTxId, { valueEncoding: 'json' });
    await contractCache.put(stateCacheKey.sortKey, value);
  }
}
