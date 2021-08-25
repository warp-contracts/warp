import Arweave from 'arweave';
import { ContractDefinition, ExecutorFactory } from '@smartweave/core';
import { SwCache } from '@smartweave/cache';
import { LoggerFactory } from '@smartweave/logging';

const logger = LoggerFactory.INST.create(__filename);

/**
 * An implementation of ExecutorFactory that adds caching capabilities
 */
export class CacheableExecutorFactory<Api> implements ExecutorFactory<Api> {
  constructor(
    arweave: Arweave,
    private readonly baseImplementation: ExecutorFactory<Api>,
    private readonly cache: SwCache<string, Api>
  ) {}

  async create<State>(contractDefinition: ContractDefinition<State>): Promise<Api> {
    // warn: do not cache on the contractDefinition.srcTxId. This might look like a good optimisation
    // (as many contracts share the same source code), but unfortunately this is causing issues
    // with the same SwGlobal object being cached for all contracts with the same source code
    // (eg. SwGlobal.contract.id field - which of course should have different value for different contracts
    // that share the same source).
    const cacheKey = contractDefinition.txId;
    if (!this.cache.contains(cacheKey)) {
      logger.debug('Updating executor factory cache');
      const handler = await this.baseImplementation.create(contractDefinition);
      this.cache.put(cacheKey, handler);
    }

    return this.cache.get(cacheKey);
  }
}
