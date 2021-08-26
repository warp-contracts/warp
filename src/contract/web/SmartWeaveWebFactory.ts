import Arweave from 'arweave';
import { HandlerBasedContract, Contract, SmartWeave } from '@smartweave/contract';
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
  HandlerApi,
  HandlerExecutorFactory,
  LexicographicalInteractionsSorter
} from '@smartweave/core';
import { BsonFileBlockHeightSwCache, MemBlockHeightSwCache, MemCache } from '@smartweave/cache';

/**
 * A factory that simplifies the process of creating different versions of {@link SmartWeave}.
 * All versions use the {@link Evolve} plugin.
 * SmartWeave instances created by this factory can be safely used in a web environment.
 */
export class SmartWeaveWebFactory {
  /**
   * Returns a {@link SmartWeave} that is using mem cache for all layers.
   */
  static memCached(arweave: Arweave): SmartWeave {
    const definitionLoader = new ContractDefinitionLoader(arweave, new MemCache());

    const interactionsLoader = new CacheableContractInteractionsLoader(
      new ContractInteractionsLoader(arweave),
      new MemBlockHeightSwCache()
    );

    const executorFactory = new CacheableExecutorFactory(arweave, new HandlerExecutorFactory(arweave), new MemCache());

    const stateEvaluator = new CacheableStateEvaluator(arweave, new MemBlockHeightSwCache<EvalStateResult<unknown>>(), [
      new Evolve(definitionLoader, executorFactory)
    ]);

    const interactionsSorter = new LexicographicalInteractionsSorter(arweave);

    return SmartWeave.builder(arweave)
      .setDefinitionLoader(definitionLoader)
      .setInteractionsLoader(interactionsLoader)
      .setInteractionsSorter(interactionsSorter)
      .setExecutorFactory(executorFactory)
      .setStateEvaluator(stateEvaluator)
      .build();
  }

  /**
   * Returns a {@link SmartWeave} that (yup, you've guessed it!) does not use any caches.
   * This one is gonna be slooow!
   */
  static nonCached(arweave: Arweave): SmartWeave {
    const definitionLoader = new ContractDefinitionLoader(arweave);
    const interactionsLoader = new ContractInteractionsLoader(arweave);
    const executorFactory = new HandlerExecutorFactory(arweave);
    const stateEvaluator = new DefaultStateEvaluator(arweave, [new Evolve(definitionLoader, executorFactory)]);
    const interactionsSorter = new LexicographicalInteractionsSorter(arweave);

    return SmartWeave.builder(arweave)
      .setDefinitionLoader(definitionLoader)
      .setInteractionsLoader(interactionsLoader)
      .setInteractionsSorter(interactionsSorter)
      .setExecutorFactory(executorFactory)
      .setStateEvaluator(stateEvaluator)
      .build();
  }
}
