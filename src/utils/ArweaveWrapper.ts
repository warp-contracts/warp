import Arweave from 'arweave';
import { AxiosResponse } from 'axios';
import { Buffer as isomorphicBuffer } from 'warp-isomorphic';
import { GqlReqVariables } from '../core/modules/impl/ArweaveGatewayInteractionsLoader';
import { WARP_GW_URL } from '../core/WarpFactory';
import { LoggerFactory } from '../logging/LoggerFactory';
import { BlockData, NetworkInfoInterface, Transaction } from './types/arweave-types';

export class ArweaveWrapper {
  private readonly logger = LoggerFactory.INST.create('ArweaveWrapper');

  private readonly baseUrl;

  constructor(private readonly arweave: Arweave) {
    this.baseUrl = `${arweave.api.config.protocol}://${arweave.api.config.host}:${arweave.api.config.port}`;
    this.logger.debug('baseurl', this.baseUrl);
  }

  async warpGwInfo(): Promise<NetworkInfoInterface> {
    return await this.doFetchInfo<NetworkInfoInterface>(`${WARP_GW_URL}/gateway/arweave/info`);
  }

  async warpGwBlock(): Promise<BlockData> {
    this.logger.debug('Calling warp gw block info');
    return await this.doFetchInfo<BlockData>(`${WARP_GW_URL}/gateway/arweave/block`);
  }

  async info(): Promise<NetworkInfoInterface> {
    return await this.doFetchInfo<NetworkInfoInterface>(`${this.baseUrl}/info`);
  }

  async gql(query: string, variables: GqlReqVariables): Promise<Partial<AxiosResponse<any>>> {
    try {
      const data = JSON.stringify({
        query: query,
        variables: variables
      });

      const response = await fetch(`${this.baseUrl}/graphql`, {
        method: 'POST',
        body: data,
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      })
        .then((res) => {
          return res.ok ? res.json() : Promise.reject(res);
        })
        .catch((error) => {
          if (error.body?.message) {
            this.logger.error(error.body.message);
          }
          throw new Error(`Unable to retrieve gql page. ${error.status}: ${error.body?.message}`);
        });

      return {
        data: response,
        status: 200
      };
    } catch (e) {
      this.logger.error('Error while loading gql', e);
      throw e;
    }
  }

  async tx(id: string): Promise<Transaction> {
    const response = await fetch(`${this.baseUrl}/tx/${id}`)
      .then((res) => {
        return res.ok ? res.json() : Promise.reject(res);
      })
      .catch((error) => {
        if (error.body?.message) {
          this.logger.error(error.body.message);
        }
        throw new Error(`Unable to retrieve tx ${id}. ${error.status}. ${error.body?.message}`);
      });

    return new Transaction({
      ...response
    });
  }

  async txData(id: string): Promise<Buffer> {
    // note: this is using arweave.net cache -
    // not very safe and clever, but fast...
    const response = await fetch(`${this.baseUrl}/${id}`);
    if (!response.ok) {
      this.logger.warn(`Unable to load data from arweave.net/${id} endpoint, falling back to arweave.js`);
      // fallback to arweave-js as a last resort..
      const txData = (await this.arweave.transactions.getData(id, {
        decode: true
      })) as Uint8Array;
      return isomorphicBuffer.from(txData);
    } else {
      const buffer = await response.arrayBuffer();
      return isomorphicBuffer.from(buffer);
    }
  }

  async txDataString(id: string): Promise<string> {
    const buffer = await this.txData(id);
    return Arweave.utils.bufferToString(buffer);
  }

  private async doFetchInfo<R>(url: string): Promise<R> {
    try {
      const response = await fetch(url)
        .then((res) => {
          return res.ok ? res.json() : Promise.reject(res);
        })
        .catch((error) => {
          if (error.body?.message) {
            this.logger.error(error.body.message);
          }
          throw new Error(`Unable to retrieve info. ${error.status}: ${error.body?.message}`);
        });

      return response;
    } catch (e) {
      this.logger.error('Error while loading info', e);
      throw e;
    }
  }
}
