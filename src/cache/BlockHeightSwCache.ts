/**
 * A cache that stores its values depending on block height (eg.: contract's state cache).
 * See {@link BsonFileBlockHeightSwCache} or {@link MemBlockHeightSwCache}
 *
 * @typeParam V - type of value stored in cache, defaults to `any`.
 */
export interface BlockHeightSwCache<V = any> {
  /**
   * returns cached value for the highest available in cache block that is not higher than `blockHeight`.
   */
  getLessOrEqual(key: string, blockHeight: number): BlockHeightCacheResult<V> | null;

  /**
   * returns latest value stored for given key
   */
  getLast(key: string): BlockHeightCacheResult<V> | null;

  /**
   * returns value for the key and exact blockHeight
   */
  get(key: string, blockHeight: number): BlockHeightCacheResult<V> | null;

  /**
   * puts new value in cache under given {@link BlockHeightKey.key} and {@link BlockHeightKey.blockHeight}.
   */
  put(blockHeightKey: BlockHeightKey, value: V);

  /**
   * checks whether cache has any value stored for given cache key
   */
  contains(key: string);
}

export class BlockHeightKey {
  constructor(readonly cacheKey: string, readonly blockHeight: number) {}
}

// tslint:disable-next-line:max-classes-per-file
export class BlockHeightCacheResult<V> {
  constructor(readonly cachedHeight: number, readonly cachedValue: V) {}
}
