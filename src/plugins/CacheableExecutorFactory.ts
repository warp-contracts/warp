import Arweave from 'arweave';
import { ContractDefinition, ExecutorFactory, HandlerApi } from '@smartweave/core';
import { SwCache } from '@smartweave/cache';
import { LoggerFactory } from '@smartweave/logging';
import { SmartWeaveGlobal } from '@smartweave/legacy';

/**
 * An implementation of ExecutorFactory that adds caching capabilities
 */
export class CacheableExecutorFactory<Api> implements ExecutorFactory<Api> {
  private readonly logger = LoggerFactory.INST.create('CacheableExecutorFactory');

  constructor(
    private readonly arweave: Arweave,
    private readonly baseImplementation: ExecutorFactory<Api>,
    private readonly cache: SwCache<string, Api>
  ) {}

  async create<State>(contractDefinition: ContractDefinition<State>): Promise<Api> {
    return await this.baseImplementation.create(contractDefinition);

    // warn: do not cache on the contractDefinition.srcTxId. This might look like a good optimisation
    // (as many contracts share the same source code), but unfortunately this is causing issues
    // with the same SwGlobal object being cached for all contracts with the same source code
    // (eg. SwGlobal.contract.id field - which of course should have different value for different contracts
    // that share the same source).
    // warn#2: cache key MUST be a combination of both txId and srcTxId -
    // as "evolve" feature changes the srcTxId for the given txId...

    // switching off caching for now
    // - https://github.com/redstone-finance/redstone-smartcontracts/issues/53
    // probably should be cached on a lower level - i.e. either handler function (for js contracts)
    // or wasm instance.
  }
}
