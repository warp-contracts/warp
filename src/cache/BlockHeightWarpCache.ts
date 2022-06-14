/**
 * A cache that stores its values depending on block height (eg.: contract's state cache).
 * See {@link BsonFileBlockHeightWarpCache} or {@link MemBlockHeightWarpCache}
 *
 * @typeParam V - type of value stored in cache, defaults to `any`.
 */
export interface BlockHeightWarpCache<V> {
  /**
   * returns cached value for the highest available in cache block that is not higher than `blockHeight`.
   */
  getLessOrEqual(key: string, blockHeight: number): Promise<BlockHeightCacheResult<V> | null>;

  /**
   * returns latest value stored for given key
   */
  getLast(key: string): Promise<BlockHeightCacheResult<V> | null>;

  /**
   * returns value for the key and exact blockHeight
   */
  get(key: string, blockHeight: number, returnDeepCopy?: boolean): Promise<BlockHeightCacheResult<V> | null>;

  /**
   * puts new value in cache under given {@link BlockHeightKey.key} and {@link BlockHeightKey.blockHeight}.
   */
  put(blockHeightKey: BlockHeightKey, value: V): Promise<void>;

  /**
   * checks whether cache has any value stored for given cache key
   */
  contains(key: string): Promise<boolean>;

  /**
   * flushes cache to underneath storage (if available)
   */
  flush(): Promise<void>;
}

export class BlockHeightKey {
  constructor(readonly cacheKey: string, readonly blockHeight: number) {}
}

// tslint:disable-next-line:max-classes-per-file
export class BlockHeightCacheResult<V> {
  constructor(readonly cachedHeight: number, readonly cachedValue: V) {}
}
