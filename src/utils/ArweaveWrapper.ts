import Arweave from 'arweave';
import { NetworkInfoInterface } from 'arweave/node/network';
import { GqlReqVariables, LoggerFactory } from '@smartweave';
import { AxiosResponse } from 'axios';
import Transaction from 'arweave/node/lib/transaction';
import 'redstone-isomorphic';

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
          throw new Error(`Unable to retrieve info. ${error.status}.`);
        });

      return response;
    } catch (e) {
      this.logger.error('Error while loading network info', e);
      throw e;
    }
  }

  async gql(query: string, variables: GqlReqVariables): Promise<Partial<AxiosResponse>> {
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
          throw new Error(`Unable to retrieve gql page. ${error.status}. ${error.body?.message}`);
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

  // DO NOT USE - it is probably not safe - see discord question from
  // https://github.com/redstone-finance/redstone-smartcontracts/issues/97
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

  async txData(id: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/${id}`);
    if (!response.ok) {
      throw new Error(`Unable to load tx data ${id}`);
    }
    const buffer = await response.arrayBuffer();
    return Arweave.utils.bufferToString(buffer);
  }
}
