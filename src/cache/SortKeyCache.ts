import { SortKeyCacheRangeOptions } from './SortKeyCacheRangeOptions';
import { BasicSortKeyCache } from './BasicSortKeyCache';

/**
 * Key-value cache storage.
 * Just as {@link BasicSortKeyCache}, items are stored
 * in lexicographical order using by sort key.
 *
 * In addition, this interface provide functionality related to
 * fetching keys and values using range options. {@link SortKeyCacheRangeOptions}
 */
export interface SortKeyCache<V> extends BasicSortKeyCache<V> {
  /**
   * deletes value in cache under given {@link CacheKey.key} from {@link CacheKey.sortKey}.
   * the value will be still available if fetched using a lower sortKey
   */
  del(cacheKey: CacheKey): Promise<void>;

  /**
   * executes a list of stacked operations
   */
  batch(opStack: BatchDBOp<V>[]);

  /**
   * Returns keys for a specified range
   */
  keys(sortKey: string, options?: SortKeyCacheRangeOptions): Promise<string[]>;

  /**
   * Returns a key value map for a specified range
   */
  kvMap(sortKey: string, options?: SortKeyCacheRangeOptions): Promise<Map<string, V>>;
}

export interface PruneStats {
  entriesBefore: number;
  entriesAfter: number;
  sizeBefore: number;
  sizeAfter: number;
}

export class CacheKey {
  constructor(readonly key: string, readonly sortKey: string) {}
}

export class SortKeyCacheResult<V> {
  constructor(readonly sortKey: string, readonly cachedValue: V) {}
}

export declare type BatchDBOp<V> = PutBatch<V> | DelBatch;

export interface PutBatch<V> {
  type: 'put';
  key: CacheKey;
  value: V;
}

export interface DelBatch {
  type: 'del';
  key: string;
}
