import Arweave from 'arweave';
import { HandlerBasedContract, Contract, SmartWeave } from './index';
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
 * A factory that simplifies the process of creating different versions of {@link Contract}.
 * All versions have the {@link Evolve} plugin...erm, plugged in ;-).
 *
 * TODO: add builders (or BUIDLers ;-)) that would simplify the process of customizing SwcClient behaviour
 * TODO: consider introducing some IoC container (like `inversify`),
 * but without forcing to use it (as some developers may be allergic to IoC/DI concepts ;-))
 * - this would probably require some consultations within the community.
 */
export class SmartWeaveFactory {
  /**
   * Returns a {@link Contract} that is using mem cache for all layers.
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
}
