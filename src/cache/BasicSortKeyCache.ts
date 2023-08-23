import { CacheKey, PruneStats, SortKeyCacheResult } from './SortKeyCache';

export interface SignatureWise {
  hash?: string;
  signature?: string;
}

/**
 * A cache that stores its values per dedicated key and sort key.
 * A sort key is a value that the SmartWeave protocol is using
 * to sort contract transactions ({@link LexicographicalInteractionsSorter}.
 *
 * All values should be stored in a lexicographical order (per key) -
 * sorted by the sort key.
 */
export interface BasicSortKeyCache<V> {
  getLessOrEqual(key: string, sortKey: string): Promise<SortKeyCacheResult<V> | null>;

  /**
   * returns value stored for a given key and last sortKey
   */
  getLast(key: string): Promise<SortKeyCacheResult<V> | null>;

  /**
   * returns last cached sort key - takes all keys into account
   */
  getLastSortKey(): Promise<string | null>;

  /**
   * returns value for the key and exact sortKey
   */
  get(cacheKey: CacheKey): Promise<SortKeyCacheResult<V> | null>;

  /**
   * puts new value in cache under given {@link CacheKey.key} and {@link CacheKey.sortKey}.
   */
  put(cacheKey: CacheKey, value: V): Promise<void>;

  /**
   * removes all data stored under a specified key
   */
  delete(key: string): Promise<void>;

  open(): Promise<void>;

  close(): Promise<void>;

  begin(): Promise<void>;

  rollback(): Promise<void>;

  commit(): Promise<void>;

  /**
   * used mostly for debugging, allows to dump the current content cache
   * It's slow.
   */
  dump(): Promise<any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  /**
   * returns underlying storage (LevelDB, LMDB, sqlite...)
   * - useful for performing low-level operations
   */
  storage<S>(): S;

  /**
   * leaves n-latest (i.e. with latest (in lexicographic order) sort keys)
   * entries for each cached key
   *
   * @param entriesStored - how many latest entries should be left
   * for each cached key
   *
   * @retun PruneStats if getting them doesn't introduce a delay, null otherwise
   */
  prune(entriesStored: number): Promise<PruneStats | null>;

  setSignature(cacheKey: CacheKey, hash: string, signature: string): Promise<void>;
}
