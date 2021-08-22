import Arweave from 'arweave';
import { ContractDefinition, ExecutorFactory } from '@core';
import { SwCache } from '@cache';

/**
 * An implementation of ExecutorFactory that adds caching capabilities
 */
export class CacheableExecutorFactory<State, Api> implements ExecutorFactory<State, Api> {
  constructor(
    arweave: Arweave,
    private readonly baseImplementation: ExecutorFactory<State, Api>,
    private readonly cache: SwCache<string, Api>
  ) {}

  async create(contractDefinition: ContractDefinition<State>): Promise<Api> {
    // warn: do not cache on the contractDefinition.srcTxId. This might look like a good optimisation
    // (as many contracts share the same source code), but unfortunately this is causing issues
    // with the same SwGlobal object being cached for all contracts with the same source code
    // (eg. SwGlobal.contract.id field - which of course should have different value for contracts
    // with the same source).

    const cacheKey = contractDefinition.txId;
    if (!this.cache.contains(cacheKey)) {
      console.log('Updating executor factory cache');
      const handler = await this.baseImplementation.create(contractDefinition);
      this.cache.put(cacheKey, handler);
    }

    return this.cache.get(cacheKey);
  }
}
