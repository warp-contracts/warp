import Arweave from 'arweave';
import { HandlerBasedSwcClient, Contract } from './index';
import {
  CacheableContractInteractionsLoader,
  CacheableExecutorFactory,
  CacheableStateEvaluator,
  Evolve
} from '@smartweave/plugins';
import {
  ContractDefinitionLoader,
  ContractInteractionsLoader,
  DefaultStateEvaluator,
  EvalStateResult,
  HandlerExecutorFactory,
  LexicographicalInteractionsSorter
} from '@smartweave/core';
import { BsonFileBlockHeightSwCache, MemBlockHeightSwCache, MemCache } from '@smartweave/cache';

/**
 * A factory that simplifies the process of creating different versions of {@link Contract}.
 * All versions have the {@link Evolve} plugin...erm, plugged in ;-).
 *
 * TODO: add builders (or BUIDLers ;-)) that would simplify the process of customizing SwcClient behaviour
 * TODO: consider introducing some IoC container (like `inversify`),
 * but without forcing to use it (as some developers may be allergic to IoC/DI concepts ;-))
 * - this would probably require some consultations within the community.
 */
export class SwClientFactory {
  /**
   * Returns a {@link Contract} that is using mem cache for all layers.
   */
  static memCacheClient(arweave: Arweave): Contract {
    const definitionLoader = new ContractDefinitionLoader<any>(arweave, new MemCache());

    const interactionsLoader = new CacheableContractInteractionsLoader(
      new ContractInteractionsLoader(arweave),
      new MemBlockHeightSwCache()
    );

    const executorFactory = new CacheableExecutorFactory(arweave, new HandlerExecutorFactory(arweave), new MemCache());

    const stateEvaluator = new CacheableStateEvaluator(arweave, new MemBlockHeightSwCache<EvalStateResult>(), [
      new Evolve(definitionLoader, executorFactory)
    ]);

    const interactionsSorter = new LexicographicalInteractionsSorter(arweave);

    return new HandlerBasedSwcClient(
      arweave,
      definitionLoader,
      interactionsLoader,
      executorFactory,
      stateEvaluator,
      interactionsSorter
    );
  }

  /**
   * Returns a {@link Contract} that is using file-based cache for {@link StateEvaluator} layer
   * and mem cache for the rest.
   */
  static fileCacheClient(arweave: Arweave, cacheBasePath?: string): Contract {
    const definitionLoader = new ContractDefinitionLoader<any>(arweave, new MemCache());

    const interactionsLoader = new CacheableContractInteractionsLoader(
      new ContractInteractionsLoader(arweave),
      new MemBlockHeightSwCache()
    );

    const executorFactory = new CacheableExecutorFactory(arweave, new HandlerExecutorFactory(arweave), new MemCache());

    const stateEvaluator = new CacheableStateEvaluator(
      arweave,
      new BsonFileBlockHeightSwCache<EvalStateResult>(cacheBasePath),
      [new Evolve(definitionLoader, executorFactory)]
    );

    const interactionsSorter = new LexicographicalInteractionsSorter(arweave);

    return new HandlerBasedSwcClient(
      arweave,
      definitionLoader,
      interactionsLoader,
      executorFactory,
      stateEvaluator,
      interactionsSorter
    );
  }

  /**
   * Returns a {@link Contract} that (yup, you've guessed it!) does not use any caches.
   * This one is gonna be slooow...
   */
  static noCacheClient(arweave: Arweave): Contract {
    const definitionLoader = new ContractDefinitionLoader(arweave);
    const interactionsLoader = new ContractInteractionsLoader(arweave);
    const executorFactory = new HandlerExecutorFactory(arweave);
    const stateEvaluator = new DefaultStateEvaluator(arweave, [new Evolve(definitionLoader, executorFactory)]);
    const interactionsSorter = new LexicographicalInteractionsSorter(arweave);

    return new HandlerBasedSwcClient(
      arweave,
      definitionLoader,
      interactionsLoader,
      executorFactory,
      stateEvaluator,
      interactionsSorter
    );
  }
}
