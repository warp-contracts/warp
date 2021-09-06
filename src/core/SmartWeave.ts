import {
  CreateContract,
  DefaultCreateContract,
  DefinitionLoader,
  ExecutorFactory,
  HandlerApi,
  InteractionsLoader,
  InteractionsSorter,
  SmartWeaveBuilder,
  StateEvaluator
} from '@smartweave/core';
import Arweave from 'arweave';
import { Contract, HandlerBasedContract } from '@smartweave/contract';

/**
 * The SmartWeave "motherboard" ;-).
 * This is the base class that supplies the implementation of the SmartWeave SDK.
 * Allows to plug-in different implementation of all the modules defined in the constructor.
 *
 * After being fully configured, it allows to "connect" to
 * contract and perform operations on them (see {@link Contract})
 */
export class SmartWeave {
  readonly createContract: CreateContract;

  constructor(
    readonly arweave: Arweave,
    readonly definitionLoader: DefinitionLoader,
    readonly interactionsLoader: InteractionsLoader,
    readonly interactionsSorter: InteractionsSorter,
    readonly executorFactory: ExecutorFactory<HandlerApi<unknown>>,
    readonly stateEvaluator: StateEvaluator
  ) {
    this.createContract = new DefaultCreateContract(arweave);
  }

  static builder(arweave: Arweave) {
    return new SmartWeaveBuilder(arweave);
  }

  contract<State>(contractTxId: string, callingContract?: Contract): Contract<State> {
    return new HandlerBasedContract<State>(contractTxId, this, callingContract);
  }
}
