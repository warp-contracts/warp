import { ContractDefinition, LoggerFactory, stripTrailingSlash, SwCache } from '@smartweave';
import Arweave from 'arweave';
import { ContractDefinitionLoader } from './ContractDefinitionLoader';

/**
 * An extension to {@link ContractDefinitionLoader} that makes use of
 * Redstone Gateway ({@link https://github.com/redstone-finance/redstone-sw-gateway})
 * to load Contract Data.
 *
 * If the contract data is not available on RedStone Gateway - it fallbacks to default implementation
 * in {@link ContractDefinitionLoader} - i.e. loads the definition from Arweave gateway.
 */
export class RedstoneGatewayContractDefinitionLoader extends ContractDefinitionLoader {
  private readonly rLogger = LoggerFactory.INST.create('RedstoneGatewayContractDefinitionLoader');

  constructor(
    private readonly baseUrl: string,
    arweave: Arweave,
    cache?: SwCache<string, ContractDefinition<unknown>>
  ) {
    super(arweave, cache);
    this.baseUrl = stripTrailingSlash(baseUrl);
  }

  async doLoad<State>(contractTxId: string, forcedSrcTxId?: string): Promise<ContractDefinition<State>> {
    if (forcedSrcTxId) {
      // no support for the evolve yet..
      return await super.doLoad(contractTxId, forcedSrcTxId);
    }

    try {
      return await fetch(`${this.baseUrl}/gateway/contracts/${contractTxId}`)
        .then((res) => {
          return res.ok ? res.json() : Promise.reject(res);
        })
        .catch((error) => {
          if (error.body?.message) {
            this.rLogger.error(error.body.message);
          }
          throw new Error(`Unable to retrieve contract data. Redstone gateway responded with status ${error.status}.`);
        });
    } catch (e) {
      this.rLogger.warn('Falling back to default contracts loader');
      return await super.doLoad(contractTxId, forcedSrcTxId);
    }
  }
}
