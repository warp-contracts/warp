import {
  DefinitionLoader,
  ExecutorFactory,
  HandlerApi,
  InteractionsLoader,
  InteractionsSorter,
  StateEvaluator
} from '@smartweave/core';
import Arweave from 'arweave';
import { Contract, HandlerBasedContract, SmartWeaveBuilder } from '@smartweave/contract';

/**
 * The "motherboard" ;-)
 */
export class SmartWeave {
  constructor(
    readonly arweave: Arweave,
    readonly definitionLoader: DefinitionLoader,
    readonly interactionsLoader: InteractionsLoader,
    readonly interactionsSorter: InteractionsSorter,
    readonly executorFactory: ExecutorFactory<HandlerApi<unknown>>,
    readonly stateEvaluator: StateEvaluator
  ) {}

  static builder(arweave: Arweave) {
    return new SmartWeaveBuilder(arweave);
  }

  contract<State>(contractTxId: string, parent?: Contract): Contract<State> {
    return new HandlerBasedContract<State>(contractTxId, this, parent);
  }
}
