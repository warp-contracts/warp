import { BlockHeightCacheResult, BlockHeightKey, BlockHeightWarpCache } from '@warp/cache';
import axios, { AxiosInstance } from 'axios';

/**
 * A {@link BlockHeightWarpCache} implementation that delegates all its methods
 * to remote endpoints.
 *
 * TODO: this could be further optimised - i.e. with the help of "level 1" memory cache
 * that would store max X elements - and would be backed up by the "level 2" remote cache.
 */
export class RemoteBlockHeightCache<V = any> implements BlockHeightWarpCache<V> {
  private axios: AxiosInstance;

  /**
   * @param type - id/type of the cache, that will allow to identify
   * it server side (e.g. "STATE" or "INTERACTIONS")
   * @param baseURL - the base url of the remote endpoint that serves
   * cache data (e.g. "http://localhost:3000")
   */
  constructor(private type: string, private baseURL: string) {
    this.axios = axios.create({
      baseURL: baseURL
    });
  }

  /**
   * GET '/last/:type/:key
   */
  async getLast(key: string): Promise<BlockHeightCacheResult<V> | null> {
    const response = await this.axios.get<BlockHeightCacheResult<V> | null>(`/last/${this.type}/${key}`);
    return response.data || null;
  }

  /**
   * GET '/less-or-equal/:type/:key/:blockHeight
   */
  async getLessOrEqual(key: string, blockHeight: number): Promise<BlockHeightCacheResult<V> | null> {
    const response = await this.axios.get<BlockHeightCacheResult<V> | null>(
      `/less-or-equal/${this.type}/${key}/${blockHeight}`
    );
    return response.data || null;
  }

  /**
   * TODO: data should "flushed" in batches...
   * PUT '/:type/:key/:blockHeight' {data: value}
   */
  async put({ cacheKey, blockHeight }: BlockHeightKey, value: V): Promise<void> {
    if (!value) {
      return;
    }
    await this.axios.put(`/${this.type}/${cacheKey}/${blockHeight}`, value);
  }

  /**
   * GET '/contains/:type/:key'
   */
  async contains(key: string): Promise<boolean> {
    const response = await this.axios.get<boolean>(`/contains/${this.type}/${key}`);
    return response.data;
  }

  /**
   * GET '/:type/:key/:blockHeight'
   */
  async get(key: string, blockHeight: number): Promise<BlockHeightCacheResult<V> | null> {
    const response = await this.axios.get<BlockHeightCacheResult<V> | null>(`/${this.type}/${key}/${blockHeight}`);
    return response.data || null;
  }

  flush(): Promise<void> {
    return Promise.resolve(undefined);
  }
}
