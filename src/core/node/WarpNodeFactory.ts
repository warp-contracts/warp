import Arweave from 'arweave';
import {
  ArweaveGatewayInteractionsLoader,
  CacheableStateEvaluator,
  ConfirmationStatus,
  ContractDefinitionLoader,
  HandlerExecutorFactory,
  LexicographicalInteractionsSorter,
  R_GW_URL,
  RedstoneGatewayContractDefinitionLoader,
  RedstoneGatewayInteractionsLoader,
  Warp,
  WarpBuilder,
  WarpWebFactory
} from '@warp/core';
import { CacheableExecutorFactory, Evolve } from '@warp/plugins';
import { FileBlockHeightSwCache, MemCache } from '@warp/cache';
import { Knex } from 'knex';
import { KnexStateCache } from '../../cache/impl/KnexStateCache';

/**
 * A {@link Warp} factory that can be safely used only in Node.js env.
 */
export class WarpNodeFactory extends WarpWebFactory {
  /**
   * Returns a fully configured, memcached {@link Warp} that is suitable for tests with ArLocal
   */
  static forTesting(arweave: Arweave): Warp {
    return this.memCachedBased(arweave).useArweaveGateway().build();
  }

  /**
   * Returns a fully configured {@link Warp} that is using file-based cache for {@link StateEvaluator} layer
   * and mem cache for the rest.
   *
   * @param cacheBasePath - path where cache files will be stored
   * @param maxStoredInMemoryBlockHeights - how many cache entries per contract will be stored in
   * the underneath mem-cache
   *
   */
  static fileCached(arweave: Arweave, cacheBasePath?: string, maxStoredInMemoryBlockHeights = 10): Warp {
    return this.fileCachedBased(arweave, cacheBasePath, maxStoredInMemoryBlockHeights).build();
  }

  /**
   * Returns a preconfigured, fileCached {@link WarpBuilder}, that allows for customization of the Warp instance.
   * Use {@link WarpBuilder.build()} to finish the configuration.
   * @param cacheBasePath - see {@link fileCached.cacheBasePath}
   * @param maxStoredInMemoryBlockHeights - see {@link fileCached.maxStoredInMemoryBlockHeights}
   *
   */
  static fileCachedBased(
    arweave: Arweave,
    cacheBasePath?: string,
    maxStoredInMemoryBlockHeights = 10,
    confirmationStatus: ConfirmationStatus = { notCorrupted: true }
  ): WarpBuilder {
    const interactionsLoader = new RedstoneGatewayInteractionsLoader(R_GW_URL, confirmationStatus);
    const definitionLoader = new RedstoneGatewayContractDefinitionLoader(R_GW_URL, arweave, new MemCache());
    const executorFactory = new CacheableExecutorFactory(arweave, new HandlerExecutorFactory(arweave), new MemCache());

    const stateEvaluator = new CacheableStateEvaluator(
      arweave,
      new FileBlockHeightSwCache(cacheBasePath, maxStoredInMemoryBlockHeights),
      [new Evolve(definitionLoader, executorFactory)]
    );

    const interactionsSorter = new LexicographicalInteractionsSorter(arweave);

    return Warp.builder(arweave)
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
  ): Promise<Warp> {
    return (await this.knexCachedBased(arweave, dbConnection, maxStoredInMemoryBlockHeights)).build();
  }

  /**
   */
  static async knexCachedBased(
    arweave: Arweave,
    dbConnection: Knex,
    maxStoredInMemoryBlockHeights = 10,
    confirmationStatus: ConfirmationStatus = { notCorrupted: true }
  ): Promise<WarpBuilder> {
    const interactionsLoader = new RedstoneGatewayInteractionsLoader(R_GW_URL, confirmationStatus);
    const definitionLoader = new RedstoneGatewayContractDefinitionLoader(R_GW_URL, arweave, new MemCache());

    const executorFactory = new CacheableExecutorFactory(arweave, new HandlerExecutorFactory(arweave), new MemCache());

    const stateEvaluator = new CacheableStateEvaluator(
      arweave,
      await KnexStateCache.init(dbConnection, maxStoredInMemoryBlockHeights),
      [new Evolve(definitionLoader, executorFactory)]
    );

    const interactionsSorter = new LexicographicalInteractionsSorter(arweave);

    return Warp.builder(arweave)
      .setDefinitionLoader(definitionLoader)
      .setInteractionsLoader(interactionsLoader)
      .useRedStoneGwInfo()
      .setInteractionsSorter(interactionsSorter)
      .setExecutorFactory(executorFactory)
      .setStateEvaluator(stateEvaluator);
  }
}
