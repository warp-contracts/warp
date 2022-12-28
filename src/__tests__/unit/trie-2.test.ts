import {DB} from '@ethereumjs/trie';
import { TrieLevel } from '../../cache/impl/TrieLevel';
import { Level } from 'level';
import {DEFAULT_LEVEL_DB_LOCATION, defaultCacheOptions} from '../../core/WarpFactory';
import {BatchDBOp} from "@ethereumjs/trie/dist/types";
import {LevelDbCache} from "../../cache/impl/LevelDbCache";
import {sleep, timeout} from "../../utils/utils";

class KV {
  private _kvBatch: BatchDBOp[] = [];

  constructor(private readonly _storage: DB | null) {}

  async put(key: string, value: string): Promise<void> {
    this.checkStorageAvailable();
    this._kvBatch.push({
      type: 'put',
      key: Buffer.from(key),
      value: Buffer.from(value)
    });
  }

  del(key: string): void {
    this.checkStorageAvailable();
    this._kvBatch.push({
      type: 'del',
      key: Buffer.from(key)
    });
  }

  async get(key: string): Promise<string | null> {
    this.checkStorageAvailable();
    const result = await this._storage.get(Buffer.from(key));
    return result?.toString() || null;
  }

  async commit(): Promise<void> {
    if (this._storage) {
      await this._storage.batch(this._kvBatch);
      this._kvBatch = [];
    }
  }

  rollback(): void {
    this._kvBatch = [];
  }

  ops(): BatchDBOp[] {
    return structuredClone(this._kvBatch);
  }

  private checkStorageAvailable() {
    if (!this._storage) {
      throw new Error('KV Storage not available');
    }
  }
}

class SwGlobalMock {
  kv: KV;
  constructor(readonly db: TrieLevel) {
    this.kv = new KV(db);
  }
}


describe('KV database', () => {

  let db1: LevelDbCache;

  beforeAll(() => {
    db1 = new LevelDbCache({...defaultCacheOptions, inMemory: true});
  });

  it('should not explode', async () => {
    // simulates checking the last cached value
    await db1.getLessOrEqual('xxx', 'yyy');
    // first readState
    await prepareHandle();
    // simulates putting the initial state in cache
    await db1.put({contractTxId: 'xxx', sortKey: 'yyy'}, {"foo": "bar"});

    // second state read
    await db1.getLessOrEqual('xxx', 'yyy');
    const {handle: handleFn2, swGlobal} = await prepareHandle();

    // simulates the code of the JsHandlerAPI.handle
    await doHandle(swGlobal, handleFn2);
  });

  async function prepareHandle() {
    await sleep(10);

    // the kv storage
    const db = new TrieLevel(new Level(`${DEFAULT_LEVEL_DB_LOCATION}/kv/the_test_${Date.now()}`));

    // simulates contract handle function
    const swGlobal = new SwGlobalMock(db);

    const handle = new Function(`
  const [swGlobal] = arguments;
  
  async function handle(state, input) {
     await sleep(500);
     console.log('from handle');
  }
  
  const sleep = (ms) => {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  return handle;
  `)(swGlobal);

    return {handle, swGlobal};
  }

  async function doHandle(swGlobal: SwGlobalMock, handleFn: Function) {
    const {timeoutId, timeoutPromise} = timeout(60);
    try {
      await Promise.race([timeoutPromise, handleFn()]);
      await swGlobal.kv.commit();
    } finally {
      clearTimeout(timeoutId);
    }
  }

});
