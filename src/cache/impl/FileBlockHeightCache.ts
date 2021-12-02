import fs from 'fs';
import path from 'path';
import { BlockHeightCacheResult, BlockHeightKey, BlockHeightSwCache } from '@smartweave/cache';
import { Benchmark, LoggerFactory } from '@smartweave/logging';
import { asc, deepCopy, desc } from '@smartweave/utils';

/**
 * An implementation of {@link BlockHeightSwCache} that stores its data in JSON files.
 * Data is flushed to disk every "batchSize" ({@link DEFAULT_BATCH_SIZE} by default) new cache entries.
 *
 * Main use-case is the per block height state cache for contracts.
 *
 * A separate file is created for each block height - otherwise it was common to
 * hit 16 megabytes file size limit for json files.
 *
 * The files are organised in the following structure:
 * --/basePath
 *   --/contractTxId_1
 *     --1.cache.json
 *     --2.cache.json
 *     ...
 *     --748832.cache.json
 *   --/contractTxId_2
 *     --1.cache.json
 *     --323332.cache.json
 * ...etc.
 *
 * Note: this is not performance-optimized for reading LARGE amount of contracts.
 * Note: BSON has issues with top-level arrays - https://github.com/mongodb/js-bson/issues/319
 * - so moving back to plain JSON...
 *
 * @Deprecated - a more mature persistent cache, based on LevelDB (or similar storage)
 * should be implemented.
 */
export const DEFAULT_BATCH_SIZE = 100;

export class FileBlockHeightSwCache<V = any> implements BlockHeightSwCache<V> {
  private readonly logger = LoggerFactory.INST.create('FileBlockHeightSwCache');

  private readonly storage: { [key: string]: { [blockHeight: string]: V } };

  private updatedStorage: { [key: string]: { [blockHeight: string]: V } } = {};

  private isFlushing = false;

  private putCounter = 0;

  constructor(
    private readonly basePath = path.join(__dirname, 'storage', 'state'),
    private readonly batchSize = DEFAULT_BATCH_SIZE
  ) {
    this.saveCache = this.saveCache.bind(this);
    this.flush = this.flush.bind(this);

    this.storage = {};

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
        const cache = JSON.parse(fs.readFileSync(path.join(cacheFilePath), 'utf-8'));

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
    if (this.isFlushing) {
      return;
    }
    this.isFlushing = true;

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
            path.join(directoryPath, directory, `${height}.cache.json`),
            JSON.stringify(this.updatedStorage[key][height])
          );
        }
      });
    } finally {
      this.isFlushing = false;
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
      .sort(asc)
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
      .sort(desc)
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
    // update disk cache every this.batchSize new entries
    if (this.putCounter === this.batchSize) {
      await this.flush();
    }
  }

  async contains(key: string): Promise<boolean> {
    return Object.prototype.hasOwnProperty.call(this.storage, key);
  }

  async get(key: string, blockHeight: number, returnDeepCopy = true): Promise<BlockHeightCacheResult<V> | null> {
    if (!(await this.contains(key))) {
      return null;
    }

    const cached = this.storage[key];

    if (!Object.prototype.hasOwnProperty.call(cached, blockHeight + '')) {
      return null;
    }

    return {
      cachedHeight: blockHeight,
      cachedValue: returnDeepCopy ? deepCopy(cached[blockHeight + '']) : cached[blockHeight + '']
    };
  }

  async flush(): Promise<void> {
    this.putCounter = 0;
    this.saveCache();
    this.updatedStorage = {};
  }
}
