import Arweave from 'arweave';
import { CacheableContractInteractionsLoader, CacheableExecutorFactory, Evolve } from '@smartweave/plugins';
import {
  CacheableStateEvaluator,
  ContractDefinitionLoader,
  ArweaveGatewayInteractionsLoader,
  HandlerExecutorFactory,
  LexicographicalInteractionsSorter,
  SmartWeave,
  SmartWeaveBuilder,
  StateCache
} from '@smartweave/core';
import { MemBlockHeightSwCache, MemCache, RemoteBlockHeightCache } from '@smartweave/cache';

/**
 * A factory that simplifies the process of creating different versions of {@link SmartWeave}.
 * All versions use the {@link Evolve} plugin.
 * SmartWeave instances created by this factory can be safely used in a web environment.
 */
export class SmartWeaveWebFactory {
  /**
   * Returns a fully configured {@link SmartWeave} that is using remote cache for all layers.
   * See {@link RemoteBlockHeightCache} for details.
   */
  static remoteCached(arweave: Arweave, cacheBaseURL: string): SmartWeave {
    return this.remoteCacheBased(arweave, cacheBaseURL).build();
  }

  /**
   * Returns a preconfigured, remoteCached {@link SmartWeaveBuilder}, that allows for customization of the SmartWeave instance.
   * Use {@link SmartWeaveBuilder.build()} to finish the configuration.
   */
  static remoteCacheBased(arweave: Arweave, cacheBaseURL: string): SmartWeaveBuilder {
    const definitionLoader = new ContractDefinitionLoader(arweave, new MemCache());

    const interactionsLoader = new CacheableContractInteractionsLoader(
      new ArweaveGatewayInteractionsLoader(arweave),
      new RemoteBlockHeightCache('INTERACTIONS', cacheBaseURL)
    );

    const executorFactory = new CacheableExecutorFactory(arweave, new HandlerExecutorFactory(arweave), new MemCache());

    const stateEvaluator = new CacheableStateEvaluator(
      arweave,
      new RemoteBlockHeightCache<StateCache<unknown>>('STATE', cacheBaseURL),
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

  /**
   * Returns a fully configured {@link SmartWeave} that is using mem cache for all layers.
   */
  static memCached(arweave: Arweave, maxStoredBlockHeights: number = Number.MAX_SAFE_INTEGER): SmartWeave {
    return this.memCachedBased(arweave, maxStoredBlockHeights).build();
  }

  /**
   * Returns a preconfigured, memCached {@link SmartWeaveBuilder}, that allows for customization of the SmartWeave instance.
   * Use {@link SmartWeaveBuilder.build()} to finish the configuration.
   */
  static memCachedBased(
    arweave: Arweave,
    maxStoredBlockHeights: number = Number.MAX_SAFE_INTEGER,
    stateCache?: MemBlockHeightSwCache<StateCache<unknown>>
  ): SmartWeaveBuilder {
    const definitionLoader = new ContractDefinitionLoader(arweave, new MemCache());

    const interactionsLoader = new ArweaveGatewayInteractionsLoader(arweave);

    const executorFactory = new CacheableExecutorFactory(arweave, new HandlerExecutorFactory(arweave), new MemCache());

    const stateEvaluator = new CacheableStateEvaluator(
      arweave,
      stateCache ? stateCache : new MemBlockHeightSwCache<StateCache<unknown>>(maxStoredBlockHeights),
      [new Evolve(definitionLoader, executorFactory)]
    );

    const interactionsSorter = new LexicographicalInteractionsSorter(arweave);

    return SmartWeave.builder(arweave)
      .setDefinitionLoader(definitionLoader)
      .setCacheableInteractionsLoader(interactionsLoader)
      .setInteractionsSorter(interactionsSorter)
      .setExecutorFactory(executorFactory)
      .setStateEvaluator(stateEvaluator);
  }
}
