import Arweave from 'arweave';
import {
  ArweaveGatewayInteractionsLoader,
  CacheableStateEvaluator,
  ConfirmationStatus,
  ContractDefinitionLoader,
  EmptyInteractionsSorter,
  HandlerExecutorFactory,
  LexicographicalInteractionsSorter,
  R_GW_URL,
  RedstoneGatewayContractDefinitionLoader,
  RedstoneGatewayInteractionsLoader,
  SmartWeave,
  SmartWeaveBuilder,
  SmartWeaveWebFactory
} from '@smartweave/core';
import { CacheableExecutorFactory, Evolve } from '@smartweave/plugins';
import { FileBlockHeightSwCache, MemCache } from '@smartweave/cache';
import { Knex } from 'knex';
import { KnexStateCache } from '../../cache/impl/KnexStateCache';

/**
 * A {@link SmartWeave} factory that can be safely used only in Node.js env.
 */
export class SmartWeaveNodeFactory extends SmartWeaveWebFactory {
  /**
   * Returns a fully configured, memcached {@link SmartWeave} that is suitable for tests with ArLocal
   */
  static forTesting(arweave: Arweave): SmartWeave {
    return this.memCachedBased(arweave).useArweaveGateway().build();
  }

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
    maxStoredInMemoryBlockHeights = 10,
    confirmationStatus: ConfirmationStatus = { notCorrupted: true }
  ): SmartWeaveBuilder {
    const interactionsLoader = new RedstoneGatewayInteractionsLoader(R_GW_URL, confirmationStatus);
    const definitionLoader = new RedstoneGatewayContractDefinitionLoader(R_GW_URL, arweave, new MemCache());
    const executorFactory = new CacheableExecutorFactory(arweave, new HandlerExecutorFactory(arweave), new MemCache());

    const stateEvaluator = new CacheableStateEvaluator(
      arweave,
      new FileBlockHeightSwCache(cacheBasePath, maxStoredInMemoryBlockHeights),
      [new Evolve(definitionLoader, executorFactory)]
    );

    const interactionsSorter = new EmptyInteractionsSorter();

    return SmartWeave.builder(arweave)
      .setDefinitionLoader(definitionLoader)
      .setInteractionsLoader(interactionsLoader)
      .useRedStoneGwInfo()
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
    maxStoredInMemoryBlockHeights = 10,
    confirmationStatus: ConfirmationStatus = { notCorrupted: true }
  ): Promise<SmartWeaveBuilder> {
    const interactionsLoader = new RedstoneGatewayInteractionsLoader(R_GW_URL, confirmationStatus);
    const definitionLoader = new RedstoneGatewayContractDefinitionLoader(R_GW_URL, arweave, new MemCache());

    const executorFactory = new CacheableExecutorFactory(arweave, new HandlerExecutorFactory(arweave), new MemCache());

    const stateEvaluator = new CacheableStateEvaluator(
      arweave,
      await KnexStateCache.init(dbConnection, maxStoredInMemoryBlockHeights),
      [new Evolve(definitionLoader, executorFactory)]
    );

    const interactionsSorter = new EmptyInteractionsSorter();

    return SmartWeave.builder(arweave)
      .setDefinitionLoader(definitionLoader)
      .setInteractionsLoader(interactionsLoader)
      .useRedStoneGwInfo()
      .setInteractionsSorter(interactionsSorter)
      .setExecutorFactory(executorFactory)
      .setStateEvaluator(stateEvaluator);
  }
}
