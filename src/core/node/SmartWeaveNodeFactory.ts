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
import { DEFAULT_BATCH_SIZE, FileBlockHeightSwCache, MemBlockHeightSwCache, MemCache } from '@smartweave/cache';

/**
 * A {@link SmartWeave} factory that can be safely used only in Node.js env.
 */
export class SmartWeaveNodeFactory extends SmartWeaveWebFactory {
  /**
   * Returns a fully configured {@link SmartWeave} that is using file-based cache for {@link StateEvaluator} layer
   * and mem cache for the rest.
   *
   * @param cacheBasePath - path where cache files will be stored
   * @param batchSize - how many cache entries will be flushed to underneath storage at once. Note: setting
   * this to "1" (or in general - "small" value) may slow down the contract execution, as cache will be flushed
   * after each put (eg. after evaluating state for each interaction transaction)
   *
   */
  static fileCached(arweave: Arweave, cacheBasePath?: string, batchSize = DEFAULT_BATCH_SIZE): SmartWeave {
    return this.fileCachedBased(arweave, cacheBasePath, batchSize).build();
  }

  /**
   * Returns a preconfigured, fileCached {@link SmartWeaveBuilder}, that allows for customization of the SmartWeave instance.
   * Use {@link SmartWeaveBuilder.build()} to finish the configuration.
   * @param cacheBasePath - see {@link fileCached.cacheBasePath}
   * @param batchSize - see {@link fileCached.batchSize}
   *
   */
  static fileCachedBased(arweave: Arweave, cacheBasePath?: string, batchSize = DEFAULT_BATCH_SIZE): SmartWeaveBuilder {
    const definitionLoader = new ContractDefinitionLoader(arweave, new MemCache());

    const interactionsLoader = new CacheableContractInteractionsLoader(
      new ContractInteractionsLoader(arweave),
      new MemBlockHeightSwCache()
    );

    const executorFactory = new CacheableExecutorFactory(arweave, new HandlerExecutorFactory(arweave), new MemCache());

    const stateEvaluator = new CacheableStateEvaluator(arweave, new FileBlockHeightSwCache(cacheBasePath, batchSize), [
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
