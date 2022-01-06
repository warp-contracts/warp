import Arweave from 'arweave';
import { NetworkInfoInterface } from 'arweave/node/network';
import { GqlReqVariables, LoggerFactory } from '@smartweave';
import { AxiosResponse } from 'axios';

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
          throw new Error(`Unable to retrieve info. ${error.status}.`);
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
}
