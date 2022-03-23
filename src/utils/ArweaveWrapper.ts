import Arweave from 'arweave';
import { NetworkInfoInterface } from 'arweave/node/network';
import { GqlReqVariables, LoggerFactory } from '@smartweave';
import { AxiosResponse } from 'axios';
import Transaction from 'arweave/node/lib/transaction';
import { Buffer as isomorphicBuffer } from 'redstone-isomorphic';

export class ArweaveWrapper {
  private readonly logger = LoggerFactory.INST.create('ArweaveWrapper');

  private readonly baseUrl;

  constructor(private readonly arweave: Arweave) {
    this.baseUrl = `${arweave.api.config.protocol}://${arweave.api.config.host}:${arweave.api.config.port}`;
    this.logger.debug('baseurl', this.baseUrl);
  }

  async info(): Promise<Partial<NetworkInfoInterface>> {
    try {
      const response = await fetch(`${this.baseUrl}/info`)
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
      this.logger.error('Error while loading network info', e);
      throw e;
    }
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
    // https://github.com/textury/arlocal/issues/83
    try {
      const txData = (await this.arweave.transactions.getData(id, {
        decode: true
      })) as Uint8Array;
      return isomorphicBuffer.from(txData);
    } catch (e) {
      const response = await fetch(`${this.baseUrl}/${id}`);
      if (!response.ok) {
        this.logger.error(e);
        this.logger.error(response.statusText);
        throw new Error('Unable to load tx data');
      }
      const buffer = await response.arrayBuffer();
      return isomorphicBuffer.from(buffer);
    }

    // note: this is using arweave.net cache -
    // not very safe and clever, but fast...
    /*const response = await fetch(`${this.baseUrl}/${id}`);
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
    }*/
  }

  async txDataString(id: string): Promise<string> {
    const buffer = await this.txData(id);
    return Arweave.utils.bufferToString(buffer);
  }
}
