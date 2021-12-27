import fs from 'fs';
import path from 'path';
import { BlockHeightKey, MemBlockHeightSwCache } from '@smartweave/cache';
import { Benchmark, LoggerFactory } from '@smartweave/logging';

/**
 * An implementation of {@link BlockHeightSwCache} that stores its data in JSON files.
 *
 * Main use-case is the per block height state cache for contracts.
 *
 * This class extends standard {@link MemBlockHeightSwCache} and add features of
 * 1. Loading cache from files to memory (during initialization)
 * 2. Flushing cache to files (only the "last" (ie. highest) block stored currently in memory
 * is being saved).
 *
 * A separate file is created for each block height - otherwise it was common to
 * hit 16 megabytes file size limit for json files.
 *
 * The files are organised in the following structure:
 * --/basePath
 *   --/contractTxId_1
 *     --1.cache.json
 *     --2.cache.json
 *     --<blockHeight>.cache.json
 *     --...
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
export class FileBlockHeightSwCache<V = any> extends MemBlockHeightSwCache<V> {
  private readonly fLogger = LoggerFactory.INST.create('FileBlockHeightSwCache');

  private isFlushing = false;

  private isDirty = false;

  constructor(
    private readonly basePath = path.join(__dirname, 'storage', 'state'),
    maxStoredInMemoryBlockHeights: number = Number.MAX_SAFE_INTEGER
  ) {
    super(maxStoredInMemoryBlockHeights);

    this.saveCache = this.saveCache.bind(this);
    this.flush = this.flush.bind(this);

    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath);
    }

    const contracts = fs.readdirSync(this.basePath);

    this.fLogger.info('Loading cache from files');

    contracts.forEach((contract) => {
      const cacheDirPath = path.join(this.basePath, contract);
      if (this.storage[contract] == null) {
        this.storage[contract] = new Map<number, V>();
      }

      const benchmark = Benchmark.measure();
      const files = fs.readdirSync(cacheDirPath);
      files.forEach((file) => {
        const cacheFilePath = path.join(cacheDirPath, file);
        const height = file.split('.')[0];
        // FIXME: "state" and "validity" should be probably split into separate json files
        const cacheValue = JSON.parse(fs.readFileSync(path.join(cacheFilePath), 'utf-8'));

        this.putSync({ cacheKey: contract, blockHeight: +height }, cacheValue);
      });
      this.fLogger.info(`loading cache for ${contract}`, benchmark.elapsed());
      this.fLogger.debug(`Amount of elements loaded for ${contract} to mem: ${this.storage[contract].size}`);
    });
    this.fLogger.debug('Storage keys', this.storage);

    process.on('exit', async () => {
      await this.flush();
      process.exit();
    });
    process.on('SIGINT', async () => {
      await this.flush();
      process.exit();
    });
  }

  private async saveCache() {
    this.isFlushing = true;
    this.fLogger.info(`==== Persisting cache ====`);
    // TODO: switch to async, as currently writing cache files may slow down contract execution.
    try {
      const directoryPath = this.basePath;
      for (const key of Object.keys(this.storage)) {
        const directory = key;
        if (!fs.existsSync(path.join(directoryPath, directory))) {
          fs.mkdirSync(path.join(directoryPath, directory));
        }

        // store only highest cached height
        const toStore = await this.getLast(key);

        // this check is a bit paranoid, since we're iterating on storage keys..
        if (toStore !== null) {
          const { cachedHeight, cachedValue } = toStore;

          fs.writeFileSync(
            path.join(directoryPath, directory, `${cachedHeight}.cache.json`),
            JSON.stringify(cachedValue)
          );
        }
      }
      this.isDirty = false;
    } catch (e) {
      this.fLogger.error('Error while flushing cache', e);
    } finally {
      this.isFlushing = false;
      this.fLogger.info(`==== Cache persisted ====`);
    }
  }

  async put({ cacheKey, blockHeight }: BlockHeightKey, value: V): Promise<void> {
    this.isDirty = true;
    return super.put({ cacheKey, blockHeight }, value);
  }

  async flush(): Promise<void> {
    if (this.isFlushing || !this.isDirty) {
      return;
    }

    await this.saveCache();
  }
}
