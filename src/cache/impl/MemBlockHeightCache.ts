import { BlockHeightCacheResult, BlockHeightKey, BlockHeightSwCache } from '@smartweave/cache';
import { ascS, deepCopy, descS } from '@smartweave/utils';
import { LoggerFactory } from '@smartweave/logging';

/**
 * A simple, in-memory cache implementation of the BlockHeightSwCache
 */
export class MemBlockHeightSwCache<V = any> implements BlockHeightSwCache<V> {
  private readonly logger = LoggerFactory.INST.create('MemBlockHeightSwCache');

  // not using map here, as setting values in map seems to be slower
  // then setting value for simple object - see tools/map-benchmark.ts
  protected storage: { [contractId: string]: { [key: string]: V } } = {};

  constructor(private maxStoredBlockHeights: number = Number.MAX_SAFE_INTEGER) {}

  flush(): Promise<void> {
    throw new Error('Method not implemented.');
  }

  async getLast(key: string): Promise<BlockHeightCacheResult<V> | null> {
    if (!(await this.contains(key))) {
      return null;
    }

    const cached = this.storage[key];

    // sort keys (ie. block heights) in asc order and get
    // the last element (ie. highest cached block height).
    const highestBlockHeight = [...Object.keys(cached)].sort(ascS).pop();

    return {
      cachedHeight: +highestBlockHeight,
      cachedValue: deepCopy(cached[highestBlockHeight])
    };
  }

  async getLessOrEqual(key: string, blockHeight: number): Promise<BlockHeightCacheResult<V> | null> {
    if (!(await this.contains(key))) {
      return null;
    }

    const cached = this.storage[key];

    // find first element in and desc-sorted keys array that is not higher than requested block height
    const highestBlockHeight = [...Object.keys(cached)].sort(descS).find((cachedBlockHeight) => {
      return +cachedBlockHeight <= blockHeight;
    });

    return highestBlockHeight === undefined
      ? null
      : {
          cachedHeight: +highestBlockHeight,
          cachedValue: deepCopy(cached[highestBlockHeight])
        };
  }

  async put({ cacheKey, blockHeight }: BlockHeightKey, value: V): Promise<void> {
    if (!(await this.contains(cacheKey))) {
      this.storage[cacheKey] = {};
    }
    const cached = this.storage[cacheKey];
    const cachedKeys = Object.keys(cached);
    if (cachedKeys.length == this.maxStoredBlockHeights) {
      const toRemove = [...cachedKeys].sort(ascS).shift();
      delete cached[toRemove];
    }

    cached['' + blockHeight] = value;
  }

  async contains(key: string): Promise<boolean> {
    return Object.prototype.hasOwnProperty.call(this.storage, key);
  }

  async get(key: string, blockHeight: number): Promise<BlockHeightCacheResult<V> | null> {
    if (!(await this.contains(key))) {
      return null;
    }

    if (!this.storage[key].hasOwnProperty('' + blockHeight)) {
      return null;
    }

    return {
      cachedHeight: blockHeight,
      cachedValue: deepCopy(this.storage[key]['' + blockHeight])
    };
  }
}
