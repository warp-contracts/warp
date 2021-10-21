import { BlockHeightCacheResult, BlockHeightKey, BlockHeightSwCache } from '@smartweave/cache';
import { deepCopy, asc, desc } from '@smartweave/utils';

/**
 * A simple, in-memory cache implementation of the BlockHeightSwCache
 */
export class MemBlockHeightSwCache<V = any> implements BlockHeightSwCache<V> {
  private storage: { [key: string]: Map<number, V> } = {};

  constructor(private maxStoredBlockHeights: number = Number.MAX_SAFE_INTEGER) {}

  async getLast(key: string): Promise<BlockHeightCacheResult<V> | null> {
    if (!(await this.contains(key))) {
      return null;
    }

    const cached: Map<number, V> = this.storage[key];

    // sort keys (ie. block heights) in asc order and get
    // the last element (ie. highest cached block height).
    const highestBlockHeight = [...cached.keys()].sort(asc).pop();

    return {
      cachedHeight: highestBlockHeight,
      cachedValue: deepCopy(cached.get(highestBlockHeight))
    };
  }

  async getLessOrEqual(key: string, blockHeight: number): Promise<BlockHeightCacheResult<V> | null> {
    if (!(await this.contains(key))) {
      return null;
    }

    const cached: Map<number, V> = this.storage[key];

    // find first element in and desc-sorted keys array that is not higher than requested block height
    const highestBlockHeight = [...cached.keys()].sort(desc).find((cachedBlockHeight) => {
      return cachedBlockHeight <= blockHeight;
    });

    return highestBlockHeight === undefined
      ? null
      : {
          cachedHeight: highestBlockHeight,
          cachedValue: deepCopy(cached.get(highestBlockHeight))
        };
  }

  async put({ cacheKey, blockHeight }: BlockHeightKey, value: V): Promise<void> {
    if (!(await this.contains(cacheKey))) {
      this.storage[cacheKey] = new Map();
    }
    const cached = this.storage[cacheKey];
    if (cached.size == this.maxStoredBlockHeights) {
      const toRemove = [...cached.keys()].sort(asc).shift();
      cached.delete(toRemove);
    }

    cached.set(blockHeight, deepCopy(value));
  }

  async contains(key: string): Promise<boolean> {
    return Object.prototype.hasOwnProperty.call(this.storage, key);
  }

  async get(key: string, blockHeight: number): Promise<BlockHeightCacheResult<V> | null> {
    if (!(await this.contains(key))) {
      return null;
    }

    if (!this.storage[key].has(blockHeight)) {
      return null;
    }

    return {
      cachedHeight: blockHeight,
      cachedValue: deepCopy(this.storage[key].get(blockHeight))
    };
  }
}
