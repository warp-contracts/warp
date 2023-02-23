/**
 * Base interface for Warp Cache implementors.
 * Useful for simple, non block-height dependant caches
 * - like contract's source code cache.
 * See {@link MemCache} for example implementation.
 *
 * @typeParam K - type of the cache key.
 * @typeParam V - type of the cache value.
 */

export interface WarpCache<K, V> {
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
  put(key: K, value: V): void;

  /**
   * clears the whole cache
   */
  clearAll(): void;

  /**
   * remove entry in cache for given key
   */
  remove(key: K): void;
}
