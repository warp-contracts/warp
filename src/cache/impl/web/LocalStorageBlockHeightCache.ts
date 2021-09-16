import { BlockHeightCacheResult, BlockHeightKey, BlockHeightSwCache, initLocalStorage } from '@smartweave';

export class LocalStorageBlockHeightCache<V = unknown> implements BlockHeightSwCache<V> {
  private readonly localStorage: Storage;

  constructor(private readonly prefix: string, private readonly maxBlocks: number = 100) {
    this.localStorage = initLocalStorage();
  }

  async getLast(key: string): Promise<BlockHeightCacheResult<V> | null> {
    if (!(await this.contains(key))) {
      return null;Block
    }

    const cached = this.getItem(key);

    // sort keys (ie. block heights) in asc order and get
    // the last element (ie. highest cached block height).
    const highestBlockHeight = [...cached.keys()].sort().pop();

    return {
      cachedHeight: highestBlockHeight,
      cachedValue: cached[highestBlockHeight]
    };
  }

  async getLessOrEqual(key: string, blockHeight: number): Promise<BlockHeightCacheResult<V> | null> {
    if (!(await this.contains(key))) {
      return null;
    }

    const cached = this.getItem(key);

    // find first element in and desc-sorted keys array that is not higher than requested block height
    const highestBlockHeight = [...cached.keys()]
      .sort()
      .reverse()
      .find((cachedBlockHeight) => {
        return cachedBlockHeight <= blockHeight;
      });

    return {
      cachedHeight: highestBlockHeight,
      cachedValue: cached[highestBlockHeight]
    };
  }

  async put({ cacheKey, blockHeight }: BlockHeightKey, value: V): Promise<void> {
    const data = (await this.contains(cacheKey)) ? this.getItem(cacheKey) : {};
    if (Object.keys(data).length === this.maxBlocks) {
      const lowestBlock = [...data.keys()].sort().shift();
      delete data[lowestBlock];
    }
    data[blockHeight] = value;

    this.setItem(cacheKey, data);
  }

  async contains(key: string): Promise<boolean> {
    return Object.prototype.hasOwnProperty.call(this.localStorage, key);
  }

  async get(key: string, blockHeight: number): Promise<BlockHeightCacheResult<V> | null> {
    if (!(await this.contains(key))) {
      return null;
    }

    const cached = this.getItem(key);

    if (!Object.prototype.hasOwnProperty.call(cached, blockHeight)) {
      return null;
    }

    return {
      cachedHeight: blockHeight,
      cachedValue: cached[blockHeight]
    };
  }

  getItem(key: string): any {
    const cachedKey = this.prefixed(key);
    return JSON.parse(this.localStorage.getItem(cachedKey));
  }

  setItem(key: string, data: unknown): void {
    const cachedKey = this.prefixed(key);
    this.localStorage.setItem(cachedKey, JSON.stringify(data));
  }

  prefixed(key): string {
    return this.prefix + key;
  }
}
