import {
  BlockHeightCacheResult,
  BlockHeightKey,
  BlockHeightSwCache,
  initLocalStorage,
  LoggerFactory
} from '@smartweave';
import { compress, decompress } from '@amoutonbrady/lz-string';

export class LocalStorageBlockHeightCache<V = unknown> implements BlockHeightSwCache<V> {
  private readonly logger = LoggerFactory.INST.create('LocalStorageBlockHeightCache');

  private putCounter = 0;

  private readonly localStorage: Storage;

  constructor(
    private readonly prefix: string,
    private readonly maxBlocks: number = 10,
    private readonly useCompression: boolean = false,
    private readonly skip: number = 0
  ) {
    this.localStorage = initLocalStorage();
  }

  async getLast(key: string): Promise<BlockHeightCacheResult<V> | null> {
    if (!(await this.contains(key))) {
      return null;
    }

    const cached = this.getItem(key);

    this.logger.trace('Cached', cached);

    // sort keys (ie. block heights) in asc order and get
    // the last element (ie. highest cached block height).
    const highestBlockHeight = Object.keys(cached)
      .map((k) => +k)
      .sort()
      .pop();

    this.logger.debug('Highest cached block height: ', highestBlockHeight);

    return {
      cachedHeight: highestBlockHeight,
      cachedValue: cached[highestBlockHeight + '']
    };
  }

  async getLessOrEqual(key: string, blockHeight: number): Promise<BlockHeightCacheResult<V> | null> {
    if (!(await this.contains(key))) {
      return null;
    }

    const cached = this.getItem(key);

    this.logger.trace('Cached', cached);

    // find first element in and desc-sorted keys array that is not higher than requested block height
    const highestBlockHeight = Object.keys(cached)
      .map((k) => +k)
      .sort()
      .reverse()
      .find((cachedBlockHeight) => {
        return cachedBlockHeight <= blockHeight;
      });

    this.logger.debug('Highest cached block height:', highestBlockHeight);

    return {
      cachedHeight: highestBlockHeight,
      cachedValue: cached[highestBlockHeight + '']
    };
  }

  async put({ cacheKey, blockHeight }: BlockHeightKey, value: V): Promise<void> {
    if (this.putCounter++ < this.skip) {
      return;
    }
    this.putCounter = 0;
    const data = (await this.contains(cacheKey)) ? this.getItem(cacheKey) : {};

    this.logger.debug('Elements length:', Object.keys(data).length);

    const keys = Object.keys(data);

    if (keys.length === this.maxBlocks) {
      const lowestBlock = keys.shift(); //keys.sort().shift();
      delete data[lowestBlock + ''];
    }

    data[blockHeight] = value;

    this.setItem(cacheKey, data);
  }

  async contains(key: string): Promise<boolean> {
    return Object.prototype.hasOwnProperty.call(this.localStorage, this.prefixed(key));
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
      cachedValue: cached[blockHeight + '']
    };
  }

  private getItem(key: string): any {
    const cachedKey = this.prefixed(key);
    return JSON.parse(
      this.useCompression ? decompress(this.localStorage.getItem(cachedKey)) : this.localStorage.getItem(cachedKey)
    );
  }

  private setItem(key: string, data: unknown): void {
    const cachedKey = this.prefixed(key);

    this.localStorage.setItem(cachedKey, this.useCompression ? compress(JSON.stringify(data)) : JSON.stringify(data));
  }

  private prefixed(key): string {
    return this.prefix + key;
  }
}
