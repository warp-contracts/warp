/**
 * Base interface for Warp Cache implementors.
 * Useful for simple, non block-height dependant caches
 * - like contract's source code cache.
 * See {@link MemCache} for example implementation.
 *
 * @typeParam K - type of the cache key, defaults to `string`
 * @typeParam V - type of the cache value, default to `any`.
 */
export interface WarpCache<K = string, V = any> {
  /**
   * gets value by its key
   */
  get(key: K): V;

  /**
   * checks whether cache contains entry for given key
   */
  contains(key: K): boolean;

  /**
   * puts new value under specified key
   */
  put(key: K, value: V);

  /**
   * clears the whole cache
   */
  clearAll();

  /**
   * remove entry in cache for given key
   */
  remove(key: K);
}
