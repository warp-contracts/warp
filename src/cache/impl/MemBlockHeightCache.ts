import { BlockHeightCacheResult, BlockHeightKey, BlockHeightSwCache } from '@smartweave/cache';

/**
 * A simple, in-memory cache implementation of the BlockHeightSwCache
 */
export class MemBlockHeightSwCache<V = any> implements BlockHeightSwCache<V> {
  private storage: { [key: string]: Map<number, V> } = {};

  async getLast(key: string): Promise<BlockHeightCacheResult<V> | null> {
    if (!(await this.contains(key))) {
      return null;
    }

    const cached: Map<number, V> = this.storage[key];

    // sort keys (ie. block heights) in asc order, then reverse and get
    // the first element (ie. highest cached block height).
    const highestBlockHeight = [...cached.keys()].sort().reverse().pop();

    return {
      cachedHeight: highestBlockHeight,
      cachedValue: cached.get(highestBlockHeight)
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
      cachedValue: cached.get(highestBlockHeight)
    };
  }

  async put({ cacheKey, blockHeight }: BlockHeightKey, value: V): Promise<void> {
    if (!(await this.contains(cacheKey))) {
      this.storage[cacheKey] = new Map();
    }

    this.storage[cacheKey].set(blockHeight, value);
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
      cachedValue: this.storage[key].get(blockHeight)
    };
  }
}
