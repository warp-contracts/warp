import fs from 'fs';
import path from 'path';
import BSON from 'bson';
import { BlockHeightCacheResult, BlockHeightKey, BlockHeightSwCache } from '@smartweave/cache';
import { Benchmark, LoggerFactory } from '@smartweave/logging';
import { deepCopy } from '@smartweave/utils';

/**
 * An example implementation of {@link BlockHeightSwCache} that stores its data in BSON files.
 * Data is flushed to disk every 10 new cache entries.
 *
 * Main use-case is the per block height state cache for contracts.
 *
 * A separate file is created for each block height - otherwise it was common to
 * hit 16 megabytes file size limit for bson files.
 *
 * At time of writing, completely cached state for all contracts, at all block heights,
 * was taking ~2.5GB of disk space :-).
 *
 * The files are organised in the following structure:
 * --/basePath
 *   --/txId_1
 *     --1.cache.bson
 *     --2.cache.bson
 *     ...
 *     --748832.cache.bson
 *   --/txId_2
 *     --1.cache.bson
 *     --323332.cache.bson
 * ...etc.
 *
 * Note: this is not performance-optimized for reading LARGE amount of contracts ;-)
 * It doesn't use any LRU or any other cache entries removal policy.
 * Consider this as an example of what might the cache implementation look-like.
 */
export class BsonFileBlockHeightSwCache<V = any> implements BlockHeightSwCache<V> {
  private readonly logger = LoggerFactory.INST.create('BsonFileBlockHeightSwCache');

  // TODO: not sure why I'm using "string" as type for blockHeight...:-)
  // probably because of some issues with BSON parser...
  private readonly storage: { [key: string]: { [blockHeight: string]: V } };

  private updatedStorage: { [key: string]: { [blockHeight: string]: V } } = {};

  private saving = false;

  private putCounter = 0;

  private readonly basePath;

  constructor(basePath?: string) {
    this.saveCache = this.saveCache.bind(this);

    this.storage = {};
    this.basePath = basePath ? basePath : path.join(__dirname, 'storage', 'state');

    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath);
    }

    const directories = fs.readdirSync(this.basePath);

    directories.forEach((directory) => {
      const cacheDirPath = path.join(this.basePath, directory);
      if (this.storage[directory] == null) {
        this.storage[directory] = {};
      }
      const benchmark = Benchmark.measure();
      const files = fs.readdirSync(cacheDirPath);
      files.forEach((file) => {
        const cacheFilePath = path.join(cacheDirPath, file);

        const height = file.split('.')[0];
        const cache = BSON.deserialize(fs.readFileSync(path.join(cacheFilePath)));

        this.storage[directory][height] = cache as V;
      });
      this.logger.debug(`loading cache for ${directory}`, benchmark.elapsed());
    });
    this.logger.debug('Storage keys', Object.keys(this.storage));

    process.on('exit', () => {
      this.saveCache();
      process.exit();
    });
    process.on('SIGINT', () => {
      this.saveCache();
      process.exit();
    });
  }

  private saveCache() {
    if (this.saving) {
      return;
    }
    this.saving = true;

    // TODO: switch to async, as currently writing cache files may slow down contract execution.
    try {
      this.logger.debug(`==== Storing cache update [${Object.keys(this.updatedStorage).length}] ====`);
      const directoryPath = this.basePath;
      Object.keys(this.updatedStorage).forEach((key) => {
        const directory = key;
        if (!fs.existsSync(path.join(directoryPath, directory))) {
          fs.mkdirSync(path.join(directoryPath, directory));
        }

        for (const height of Object.keys(this.updatedStorage[key])) {
          fs.writeFileSync(
            path.join(directoryPath, directory, `${height}.cache.bson`),
            BSON.serialize(this.updatedStorage[key][height])
          );
        }
      });
    } finally {
      this.saving = false;
    }
  }

  async getLast(key: string): Promise<BlockHeightCacheResult<V> | null> {
    if (!(await this.contains(key))) {
      return null;
    }

    const cached = this.storage[key];

    // sort keys (ie. block heights) in asc order and get
    // the first element (ie. highest cached block height).
    const highestBlockHeight = Object.keys(cached)
      .map((k) => +k)
      .sort()
      .pop();

    return {
      cachedHeight: highestBlockHeight,
      cachedValue: deepCopy(cached[highestBlockHeight + ''])
    };
  }

  async getLessOrEqual(key: string, blockHeight: number): Promise<BlockHeightCacheResult<V> | null> {
    if (!(await this.contains(key))) {
      return null;
    }

    const cached = this.storage[key];

    // find first element in a desc-sorted keys array that is not higher than requested block height
    const highestBlockHeight = Object.keys(cached)
      .map((k) => +k)
      .sort()
      .reverse()
      .find((cachedBlockHeight) => {
        return cachedBlockHeight <= blockHeight;
      });

    // if no such element in cache
    if (highestBlockHeight === undefined) {
      return null;
    }

    return {
      cachedHeight: highestBlockHeight,
      cachedValue: deepCopy(cached[highestBlockHeight + ''])
    };
  }

  async put({ cacheKey, blockHeight }: BlockHeightKey, value: V): Promise<void> {
    if (!(await this.contains(cacheKey))) {
      this.storage[cacheKey] = {};
    }

    if (!Object.prototype.hasOwnProperty.call(this.updatedStorage, cacheKey)) {
      this.updatedStorage[cacheKey] = {};
    }

    const copiedValue = deepCopy(value);

    this.storage[cacheKey][blockHeight + ''] = copiedValue;
    this.updatedStorage[cacheKey][blockHeight + ''] = copiedValue;
    this.putCounter++;
    // update disk cache every 10 new entries
    if (this.putCounter === 10) {
      this.putCounter = 0;
      this.saveCache();
      this.updatedStorage = {};
    }
  }

  async contains(key: string): Promise<boolean> {
    return Object.prototype.hasOwnProperty.call(this.storage, key);
  }

  async get(key: string, blockHeight: number): Promise<BlockHeightCacheResult<V> | null> {
    throw new Error('Not implemented yet');
  }
}
