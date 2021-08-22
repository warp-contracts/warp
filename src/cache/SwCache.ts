/**
 * Base interface for SmartWeave Cache implementors.
 * Useful for simple, non block-height dependant caches
 * - like contract's source code cache.
 * See {@link MemCache} for example implementation.
 *
 * @typeParam K - type of the cache key, defaults to `string`
 * @typeParam V - type of the cache value, default to `any`.
 */
export interface SwCache<K = string, V = any> {
  get(key: K): V;

  contains(key: K): boolean;

  put(key: K, value: V);

  clearAll();

  remove(key: K);
}
