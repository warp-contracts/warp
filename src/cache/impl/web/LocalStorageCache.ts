import { initLocalStorage, SwCache } from '@smartweave';

export class LocalStorageCache<V = unknown> implements SwCache<string, V> {
  private readonly localStorage: Storage;

  constructor(private readonly prefix: string) {
    this.localStorage = initLocalStorage();
  }

  clearAll(): void {
    Object.keys(this.localStorage).forEach((key: string) => {
      if (key.startsWith(this.prefix)) {
        this.localStorage.removeItem(key);
      }
    });
  }

  contains(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.localStorage, this.prefixed(key));
  }

  get(key: string): V {
    return JSON.parse(this.localStorage.getItem(this.prefixed(key)));
  }

  put(key: string, value: V): void {
    this.localStorage.setItem(this.prefixed(key), JSON.stringify(value));
  }

  remove(key: string): void {
    this.localStorage.removeItem(this.prefixed(key));
  }

  private prefixed(key: string): string {
    return this.prefix + key;
  }
}
