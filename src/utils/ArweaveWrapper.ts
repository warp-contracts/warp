import Arweave from 'arweave';
import { NetworkInfoInterface } from 'arweave/node/network';
import { GqlReqVariables, isNode, LoggerFactory } from '@smartweave';
import { AxiosResponse } from 'axios';

export default class ArweaveWrapper {
  private readonly logger = LoggerFactory.INST.create('ArweaveWrapper');

  private undici;
  private readonly baseUrl;

  constructor(private readonly arweave: Arweave) {
    if (isNode) {
      this.undici = require('undici');
    }
    this.baseUrl = `${arweave.api.config.protocol}://${arweave.api.config.host}:${arweave.api.config.port}`;
    this.logger.debug('baseurl', this.baseUrl);
  }

  async info(): Promise<Partial<NetworkInfoInterface>> {
    if (isNode) {
      try {
        const { body } = await this.undici.request(`${this.baseUrl}/info`);
        return await body.json();
      } catch (e) {
        this.logger.error('Error while loading network info', e);
        throw e;
      }
    } else {
      return this.arweave.network.getInfo();
    }
  }

  async gql(query: string, variables: GqlReqVariables): Promise<Partial<AxiosResponse>> {
    if (isNode) {
      try {
        const data = JSON.stringify({
          query: query,
          variables: variables
        });

        const { statusCode, body } = await this.undici.request(`${this.baseUrl}/graphql`, {
          method: 'POST',
          body: data,
          headers: {
            'Accept-Encoding': 'gzip, deflate, br',
            'Content-Type': 'application/json',
            Accept: 'application/json'
          }
        });

        // todo: stats code handling

        const result = await body.json();
        return {
          data: result,
          status: statusCode
        };
      } catch (e) {
        this.logger.error('Error while loading gql', e);
        throw e;
      }
    } else {
      return await this.arweave.api.post('graphql', {
        query,
        variables
      });
    }
  }
}
