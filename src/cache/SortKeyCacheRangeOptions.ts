/**
 * Range option for fetching items from kv storage {@link SortKeyCache}
 * @param gte - greater than equals
 * @param lt - less than
 * @param reverse - reverses the order
 * @param limit - limits output elements
 */
export interface SortKeyCacheRangeOptions {
  gte?: string;
  lt?: string;
  reverse?: boolean | undefined;
  limit?: number | undefined;
}
