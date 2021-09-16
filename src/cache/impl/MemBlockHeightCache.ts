import { BlockHeightCacheResult, BlockHeightKey, BlockHeightSwCache } from '@smartweave/cache';
import { deepCopy } from '@smartweave/utils';

/**
 * A simple, in-memory cache implementation of the BlockHeightSwCache
 *
 * Note: this is not performance-optimized for reading LARGE amount of contracts.
 * It doesn't use any LRU or any other cache entries removal policy.
 * Consider this as an example of what the cache implementation may look-like.
 */
export class MemBlockHeightSwCache<V = any> implements BlockHeightSwCache<V> {
  private storage: { [key: string]: Map<number, V> } = {};

  async getLast(key: string): Promise<BlockHeightCacheResult<V> | null> {
    if (!(await this.contains(key))) {
      return null;
    }

    const cached: Map<number, V> = this.storage[key];

    // sort keys (ie. block heights) in asc order and get
    // the last element (ie. highest cached block height).
    const highestBlockHeight = [...cached.keys()].sort().pop();

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
    const highestBlockHeight = [...cached.keys()]
      .sort()
      .reverse()
      .find((cachedBlockHeight) => {
        return cachedBlockHeight <= blockHeight;
      });

    return {
      cachedHeight: highestBlockHeight,
      cachedValue: deepCopy(cached.get(highestBlockHeight))
    };
  }

  async put({ cacheKey, blockHeight }: BlockHeightKey, value: V): Promise<void> {
    if (!(await this.contains(cacheKey))) {
      this.storage[cacheKey] = new Map();
    }
    this.storage[cacheKey].set(blockHeight, deepCopy(value));
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
