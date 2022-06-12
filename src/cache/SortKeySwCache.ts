export interface SortKeySwCache<V> {
  getLessOrEqual(key: string, sortKey: string): Promise<SortKeyCacheResult<V> | null>;

  /**
   * returns latest value stored for given key
   */
  getLast(key: string): Promise<SortKeyCacheResult<V> | null>;

  /**
   * returns value for the key and exact blockHeight
   */
  get(contractTxId: string, sortKey: string, returnDeepCopy?: boolean): Promise<SortKeyCacheResult<V> | null>;

  /**
   * puts new value in cache under given {@link StateCacheKey.key} and {@link StateCacheKey.blockHeight}.
   */
  put(stateCacheKey: StateCacheKey, value: V): Promise<void>;

  close(): Promise<void>;

  dump(): Promise<any>;
}

export class StateCacheKey {
  constructor(readonly contractTxId: string, readonly sortKey: string) {}
}

// tslint:disable-next-line:max-classes-per-file
export class SortKeyCacheResult<V> {
  constructor(readonly sortKey: string, readonly cachedValue: V) {}
}
