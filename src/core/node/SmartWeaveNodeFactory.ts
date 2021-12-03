import Arweave from 'arweave';
import {
  CacheableStateEvaluator,
  ContractDefinitionLoader,
  ContractInteractionsLoader,
  HandlerExecutorFactory,
  LexicographicalInteractionsSorter,
  SmartWeave,
  SmartWeaveBuilder,
  SmartWeaveWebFactory
} from '@smartweave/core';
import { CacheableContractInteractionsLoader, CacheableExecutorFactory, Evolve } from '@smartweave/plugins';
import { FileBlockHeightSwCache, MemBlockHeightSwCache, MemCache } from '@smartweave/cache';
import { Knex } from 'knex';
import { KnexStateCache } from '../../cache/impl/KnexStateCache';

/**
 * A {@link SmartWeave} factory that can be safely used only in Node.js env.
 */
export class SmartWeaveNodeFactory extends SmartWeaveWebFactory {
  /**
   * Returns a fully configured {@link SmartWeave} that is using file-based cache for {@link StateEvaluator} layer
   * and mem cache for the rest.
   *
   * @param cacheBasePath - path where cache files will be stored
   * @param maxStoredInMemoryBlockHeights - how many cache entries per contract will be stored in
   * the underneath mem-cache
   *
   */
  static fileCached(arweave: Arweave, cacheBasePath?: string, maxStoredInMemoryBlockHeights = 10): SmartWeave {
    return this.fileCachedBased(arweave, cacheBasePath, maxStoredInMemoryBlockHeights).build();
  }

  /**
   * Returns a preconfigured, fileCached {@link SmartWeaveBuilder}, that allows for customization of the SmartWeave instance.
   * Use {@link SmartWeaveBuilder.build()} to finish the configuration.
   * @param cacheBasePath - see {@link fileCached.cacheBasePath}
   * @param maxStoredInMemoryBlockHeights - see {@link fileCached.maxStoredInMemoryBlockHeights}
   *
   */
  static fileCachedBased(
    arweave: Arweave,
    cacheBasePath?: string,
    maxStoredInMemoryBlockHeights = 10
  ): SmartWeaveBuilder {
    const definitionLoader = new ContractDefinitionLoader(arweave, new MemCache());

    const interactionsLoader = new CacheableContractInteractionsLoader(
      new ContractInteractionsLoader(arweave),
      new MemBlockHeightSwCache()
    );

    const executorFactory = new CacheableExecutorFactory(arweave, new HandlerExecutorFactory(arweave), new MemCache());

    const stateEvaluator = new CacheableStateEvaluator(
      arweave,
      new FileBlockHeightSwCache(cacheBasePath, maxStoredInMemoryBlockHeights),
      [new Evolve(definitionLoader, executorFactory)]
    );

    const interactionsSorter = new LexicographicalInteractionsSorter(arweave);

    return SmartWeave.builder(arweave)
      .setDefinitionLoader(definitionLoader)
      .setInteractionsLoader(interactionsLoader)
      .setInteractionsSorter(interactionsSorter)
      .setExecutorFactory(executorFactory)
      .setStateEvaluator(stateEvaluator);
  }

  static async knexCached(
    arweave: Arweave,
    dbConnection: Knex,
    maxStoredInMemoryBlockHeights = 10
  ): Promise<SmartWeave> {
    return (await this.knexCachedBased(arweave, dbConnection, maxStoredInMemoryBlockHeights)).build();
  }

  /**
   */
  static async knexCachedBased(
    arweave: Arweave,
    dbConnection: Knex,
    maxStoredInMemoryBlockHeights = 10
  ): Promise<SmartWeaveBuilder> {
    const definitionLoader = new ContractDefinitionLoader(arweave, new MemCache());

    const interactionsLoader = new CacheableContractInteractionsLoader(
      new ContractInteractionsLoader(arweave),
      new MemBlockHeightSwCache()
    );

    const executorFactory = new CacheableExecutorFactory(arweave, new HandlerExecutorFactory(arweave), new MemCache());

    const stateEvaluator = new CacheableStateEvaluator(
      arweave,
      await KnexStateCache.init(dbConnection, maxStoredInMemoryBlockHeights),
      [new Evolve(definitionLoader, executorFactory)]
    );

    const interactionsSorter = new LexicographicalInteractionsSorter(arweave);

    return SmartWeave.builder(arweave)
      .setDefinitionLoader(definitionLoader)
      .setInteractionsLoader(interactionsLoader)
      .setInteractionsSorter(interactionsSorter)
      .setExecutorFactory(executorFactory)
      .setStateEvaluator(stateEvaluator);
  }
}
