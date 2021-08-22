import { BlockHeightCacheResult, BlockHeightKey, BlockHeightSwCache } from '@cache';

/**
 * A simple, in-memory cache implementation of the BlockHeightSwCache
 */
export class MemBlockHeightSwCache<V = any> implements BlockHeightSwCache<V> {
  private storage: { [key: string]: Map<number, V> } = {};

  getLast(key: string): BlockHeightCacheResult<V> | null {
    if (!this.contains(key)) {
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

  getLessOrEqual(key: string, blockHeight: number): BlockHeightCacheResult<V> | null {
    if (!this.contains(key)) {
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

  put({ cacheKey, blockHeight }: BlockHeightKey, value: V) {
    if (!this.contains(cacheKey)) {
      this.storage[cacheKey] = new Map();
    }

    this.storage[cacheKey].set(blockHeight, value);
  }

  contains(key: string) {
    return this.storage.hasOwnProperty(key);
  }

  get(key: string, blockHeight: number): BlockHeightCacheResult<V> | null {
    if (!this.contains(key)) {
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
