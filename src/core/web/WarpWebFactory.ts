import Arweave from 'arweave';
import { CacheableContractInteractionsLoader, CacheableExecutorFactory, Evolve } from '@warp/plugins';
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
  StateCache
} from '@warp/core';
import { MemBlockHeightSwCache, MemCache, RemoteBlockHeightCache } from '@warp/cache';

/**
 * A factory that simplifies the process of creating different versions of {@link Warp}.
 * All versions use the {@link Evolve} plugin.
 * Warp instances created by this factory can be safely used in a web environment.
 */
export class WarpWebFactory {
  /**
   * Returns a fully configured {@link Warp} that is using mem cache for all layers.
   */
  static memCached(arweave: Arweave, maxStoredBlockHeights = 10): Warp {
    return this.memCachedBased(arweave, maxStoredBlockHeights).build();
  }

  /**
   * Returns a preconfigured, memCached {@link WarpBuilder}, that allows for customization of the Warp instance.
   * Use {@link WarpBuilder.build()} to finish the configuration.
   */
  static memCachedBased(
    arweave: Arweave,
    maxStoredBlockHeights = 10,
    confirmationStatus: ConfirmationStatus = { notCorrupted: true }
  ): WarpBuilder {
    const interactionsLoader = new RedstoneGatewayInteractionsLoader(R_GW_URL, confirmationStatus);
    const definitionLoader = new RedstoneGatewayContractDefinitionLoader(R_GW_URL, arweave, new MemCache());

    const executorFactory = new CacheableExecutorFactory(arweave, new HandlerExecutorFactory(arweave), new MemCache());

    const stateEvaluator = new CacheableStateEvaluator(
      arweave,
      new MemBlockHeightSwCache<StateCache<unknown>>(maxStoredBlockHeights),
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
