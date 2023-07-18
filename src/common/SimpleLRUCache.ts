export class SimpleLRUCache<K, V> {
  private readonly cache: Map<K, V>;
  private readonly capacity: number;
  constructor(capacity: number) {
    this.cache = new Map<K, V>();
    this.capacity = capacity || 10;
  }

  has(key: K) {
    return this.cache.has(key);
  }

  size(): number {
    return this.cache.size;
  }

  get(key: K): V {
    if (!this.cache.has(key)) return null;

    const val = this.cache.get(key);

    this.cache.delete(key);
    this.cache.set(key, val);

    return val;
  }

  set(key: K, value: V) {
    this.cache.delete(key);

    if (this.cache.size === this.capacity) {
      this.cache.delete(this.cache.keys().next().value);
      this.cache.set(key, value);
    } else {
      this.cache.set(key, value);
    }
  }

  keys(): K[] {
    return Array.from(this.cache.keys());
  }
}
