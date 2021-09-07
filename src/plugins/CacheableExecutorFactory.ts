import Arweave from 'arweave';
import { ContractDefinition, ExecutorFactory } from '@smartweave/core';
import { SwCache } from '@smartweave/cache';
import { LoggerFactory } from '@smartweave/logging';

/**
 * An implementation of ExecutorFactory that adds caching capabilities
 */
export class CacheableExecutorFactory<Api> implements ExecutorFactory<Api> {
  private readonly logger = LoggerFactory.INST.create('CacheableExecutorFactory');

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
    // warn#2: cache key MUST be a combination of both txId and srcTxId -
    // as "evolve" feature changes the srcTxId for the given txId...
    const cacheKey = `${contractDefinition.txId}_${contractDefinition.srcTxId}`;
    if (!this.cache.contains(cacheKey)) {
      this.logger.debug('Updating executor factory cache');
      const handler = await this.baseImplementation.create(contractDefinition);
      this.cache.put(cacheKey, handler);
    }

    return this.cache.get(cacheKey);
  }
}
