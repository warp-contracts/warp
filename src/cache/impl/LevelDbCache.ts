import { SortKeySwCache, StateCacheKey, SortKeyCacheResult } from '../SortKeySwCache';
import { CacheOptions, isNode, LoggerFactory } from '@smartweave';
import { Level } from 'level';
import stringify from 'safe-stable-stringify';
import { MemoryLevel } from 'memory-level';

export class LevelDbCache<V = any> implements SortKeySwCache<V> {
  private readonly logger = LoggerFactory.INST.create('LevelDbCache');

  private db: MemoryLevel;
  private maxStoredTransactions: number;

  private entriesLength: { [contractTxId: string]: number } = {};

  constructor(cacheOptions: CacheOptions) {
    if (cacheOptions.inMemory) {
      this.db = new MemoryLevel({ valueEncoding: 'json' });
    } else {
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
    }
    this.maxStoredTransactions = cacheOptions.maxStoredTransactions || 10;
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
    let entries = this.entriesLength[stateCacheKey.contractTxId];

    const alreadyCached = await this.get(stateCacheKey.contractTxId, stateCacheKey.sortKey);
    if (alreadyCached != null) {
      if (stringify((alreadyCached.cachedValue as any).state) != stringify((value as any).state)) {
        /*throw new Error(
          `Value ${stringify((value as any).state)} for sortKey ${stateCacheKey.contractTxId}:${
            stateCacheKey.sortKey
          } already cached: ${stringify((alreadyCached.cachedValue as any).state)}`
        );*/
      }
    }

    if (entries == undefined) {
      const allEntries = await contractCache.iterator().all();
      entries = this.entriesLength[stateCacheKey.contractTxId] = allEntries.length;
    }
    if (entries >= this.maxStoredTransactions * 2) {
      await contractCache.clear({ limit: this.maxStoredTransactions });
      entries = this.entriesLength[stateCacheKey.contractTxId] = entries - this.maxStoredTransactions;
    }

    await contractCache.put(stateCacheKey.sortKey, value);
    this.entriesLength[stateCacheKey.contractTxId] = entries + 1;
  }

  close(): Promise<void> {
    return this.db.close();
  }

  async dump(): Promise<any> {
    const result = await this.db.iterator().all();
    return result;
  }
}
