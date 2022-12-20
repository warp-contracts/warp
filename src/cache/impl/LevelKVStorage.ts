import { Level } from 'level';
import { MemoryLevel } from 'memory-level';
import { DB } from '@ethereumjs/trie';
import { CacheOptions } from '../../core/WarpFactory';
import { LoggerFactory } from '../../logging/LoggerFactory';
import { BatchDBOp } from '@ethereumjs/trie/dist/types';

const ENCODING_OPTS = { keyEncoding: 'buffer', valueEncoding: 'buffer' };

export class LevelKVStorage implements DB {
  private readonly logger = LoggerFactory.INST.create('LevelKVStorage');
  private _db: MemoryLevel;

  constructor(private readonly cacheOptions: CacheOptions) {}

  // Lazy initialization upon first access
  private get db(): MemoryLevel {
    if (!this._db) {
      if (this.cacheOptions.inMemory) {
        this._db = new MemoryLevel(ENCODING_OPTS);
      } else {
        if (!this.cacheOptions.dbLocation) {
          throw new Error('LevelDb cache configuration error - no db location specified');
        }
        const dbLocation = this.cacheOptions.dbLocation;
        this.logger.info(`Using location ${dbLocation}`);
        this._db = new Level<string, any>(dbLocation, ENCODING_OPTS);
      }
    }
    return this._db;
  }

  async get(key: Buffer): Promise<Buffer | null> {
    let value = null;
    try {
      await this.db.open();
      value = await this.db.get(key, ENCODING_OPTS);
    } catch (error) {
      // This should be `true` if the error came from LevelDB
      // so we can check for `NOT true` to identify any non-404 errors
      if (error.notFound !== true) {
        throw error;
      }
    } finally {
      await this.db.close();
    }
    return value;
  }

  async put(key: Buffer, val: Buffer): Promise<void> {
    await this.db.open();
    await this.db.put(key, val, ENCODING_OPTS);
    await this.db.close();
  }

  async del(key: Buffer): Promise<void> {
    await this.db.open();
    await this.db.del(key, ENCODING_OPTS);
    await this.db.close();
  }

  async batch(opStack: BatchDBOp[]): Promise<void> {
    await this.db.open();
    await this.db.batch(opStack, ENCODING_OPTS);
    await this.db.close();
  }

  copy(): DB {
    console.log('copy');
    return new LevelKVStorage(this.cacheOptions);
  }
}
