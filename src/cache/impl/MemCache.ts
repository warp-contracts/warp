import { SwCache } from '@warp/cache';

/**
 * A simple, in-memory cache, with keys being transaction ids (e.g. contract transaction id).
 */
export class MemCache<V = any> implements SwCache<string, V> {
  private readonly storage: { [key: string]: V } = {};

  clearAll() {
    Object.keys(this.storage).forEach((key) => {
      delete this.storage[key];
    });
  }

  contains(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.storage, key);
  }

  get(key: string): V {
    return this.storage[key];
  }

  put(key: string, value: V) {
    this.storage[key] = value;
  }

  remove(key: string) {
    delete this.storage[key];
  }
}
