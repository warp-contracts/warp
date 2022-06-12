import { SortKeyCacheResult, SortKeySwCache, StateCacheKey } from '../SortKeySwCache';
import { LoggerFactory } from '@smartweave';
import { Database, open } from 'lmdb';

export class LmdbCache<V = any> implements SortKeySwCache<V> {
  private readonly logger = LoggerFactory.INST.create('LmdbCache');

  private baseDbLocation = `./cache/warp`;

  private openedDbs: { [contractTxId: string]: Database<V, string> } = {};

  constructor() {
    this.subLevel = this.subLevel.bind(this);
  }

  async get(contractTxId: string, sortKey: string, returnDeepCopy?: boolean): Promise<SortKeyCacheResult<V> | null> {
    const contractCache = this.subLevel(contractTxId);
    const result = await contractCache.get(sortKey);

    if (result) {
      return {
        sortKey: sortKey,
        cachedValue: result
      };
    } else {
      return null;
    }
  }

  async getLast(contractTxId: string): Promise<SortKeyCacheResult<V> | null> {
    const contractCache = this.subLevel(contractTxId);
    const result = contractCache.getRange({
      reverse: true,
      limit: 1
    }).asArray;
    if (result.length) {
      return {
        sortKey: result[0].key,
        cachedValue: result[0].value
      };
    } else {
      return null;
    }
  }

  async getLessOrEqual(contractTxId: string, sortKey: string): Promise<SortKeyCacheResult<V> | null> {
    const contractCache = this.subLevel(contractTxId);
    const result = contractCache.getRange({
      reverse: true,
      limit: 1,
      end: sortKey
    }).asArray;
    if (result.length) {
      return {
        sortKey: result[0].key,
        cachedValue: result[0].value
      };
    } else {
      return null;
    }
  }

  async put(stateCacheKey: StateCacheKey, value: V): Promise<void> {
    const contractCache = this.subLevel(stateCacheKey.contractTxId);
    await contractCache.put(stateCacheKey.sortKey, value);
  }

  async close(): Promise<void> {
    for (const k of Object.keys(this.openedDbs)) {
      await this.openedDbs[k].close();
    }
  }

  private subLevel(contractTxId: string): Database<V, string> {
    if (!this.openedDbs[contractTxId]) {
      this.openedDbs[contractTxId] = open({
        path: `${this.baseDbLocation}/${contractTxId}`,
        compression: false,
        encoding: 'json'
      });
    }
    return this.openedDbs[contractTxId];
  }

  dump(): Promise<any> {
    return Promise.resolve(undefined);
  }
}
