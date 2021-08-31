import {
  Contract,
  HandlerBasedContract,
  SmartWeave,
  SmartWeaveBuilder,
  SmartWeaveWebFactory
} from '@smartweave/contract';
import Arweave from 'arweave';
import {
  ContractDefinitionLoader,
  ContractInteractionsLoader,
  EvalStateResult,
  HandlerExecutorFactory,
  LexicographicalInteractionsSorter
} from '@smartweave/core';
import {
  CacheableContractInteractionsLoader,
  CacheableExecutorFactory,
  CacheableStateEvaluator,
  Evolve
} from '@smartweave/plugins';
import { BsonFileBlockHeightSwCache, MemBlockHeightSwCache, MemCache } from '@smartweave/cache';

/**
 * A {@link SmartWeave} factory that can be safely used only in Node.js env.
 */
export class SmartWeaveNodeFactory extends SmartWeaveWebFactory {
  /**
   * Returns a fully configured {@link SmartWeave} that is using file-based cache for {@link StateEvaluator} layer
   * and mem cache for the rest.
   */
  static fileCached(arweave: Arweave, cacheBasePath?: string): SmartWeave {
    return this.fileCachedBased(arweave, cacheBasePath).build();
  }

  /**
   * Returns a preconfigured, fileCached {@link SmartWeaveBuilder}, that allows for customization of the SmartWeave instance.
   * Use {@link SmartWeaveBuilder.build()} to finish the configuration.
   */
  static fileCachedBased(arweave: Arweave, cacheBasePath?: string): SmartWeaveBuilder {
    const definitionLoader = new ContractDefinitionLoader(arweave, new MemCache());

    const interactionsLoader = new CacheableContractInteractionsLoader(
      new ContractInteractionsLoader(arweave),
      new MemBlockHeightSwCache()
    );

    const executorFactory = new CacheableExecutorFactory(arweave, new HandlerExecutorFactory(arweave), new MemCache());

    const stateEvaluator = new CacheableStateEvaluator(arweave, new BsonFileBlockHeightSwCache(cacheBasePath), [
      new Evolve(definitionLoader, executorFactory)
    ]);

    const interactionsSorter = new LexicographicalInteractionsSorter(arweave);

    return SmartWeave.builder(arweave)
      .setDefinitionLoader(definitionLoader)
      .setInteractionsLoader(interactionsLoader)
      .setInteractionsSorter(interactionsSorter)
      .setExecutorFactory(executorFactory)
      .setStateEvaluator(stateEvaluator);
  }
}
