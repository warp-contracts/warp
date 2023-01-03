import { MemoryLevel } from 'memory-level';

import type { BatchDBOp, DB } from '@ethereumjs/trie';
import type { AbstractLevel } from 'abstract-level';
import { KVDatabase } from '../../core/Warp';

const ENCODING_OPTS = { keyEncoding: 'buffer', valueEncoding: 'buffer' };

export class TrieLevel implements KVDatabase {
  readonly _leveldb: AbstractLevel<string | Buffer | Uint8Array, string | Buffer, string | Buffer>;

  constructor(leveldb?: AbstractLevel<string | Buffer | Uint8Array, string | Buffer, string | Buffer> | null) {
    this._leveldb = leveldb ?? new MemoryLevel(ENCODING_OPTS);
  }

  async get(key: Buffer): Promise<Buffer | null> {
    let value: Buffer | null = null;
    try {
      value = await this._leveldb.get(key, ENCODING_OPTS);
    } catch (error: any) {
      // https://github.com/Level/abstract-level/blob/915ad1317694d0ce8c580b5ab85d81e1e78a3137/abstract-level.js#L309
      // This should be `true` if the error came from LevelDB
      // so we can check for `NOT true` to identify any non-404 errors
      if (error.notFound !== true) {
        throw error;
      }
    }
    return value;
  }

  async put(key: Buffer, val: Buffer): Promise<void> {
    await this._leveldb.put(key, val, ENCODING_OPTS);
  }

  async del(key: Buffer): Promise<void> {
    await this._leveldb.del(key, ENCODING_OPTS);
  }

  async batch(opStack: BatchDBOp[]): Promise<void> {
    await this._leveldb.batch(opStack, ENCODING_OPTS);
  }

  copy(): DB {
    return new TrieLevel(this._leveldb);
  }

  close(): Promise<void> {
    return this._leveldb.close();
  }

  open(): Promise<void> {
    return this._leveldb.open();
  }
}
