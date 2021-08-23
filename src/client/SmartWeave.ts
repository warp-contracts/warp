import { DefinitionLoader, ExecutorFactory, InteractionsLoader, StateEvaluator } from '@core';
import Arweave from 'arweave';
import { Contract } from '@client';

export class SmartWeave {
  constructor(
    private readonly arweave: Arweave,
    private readonly definitionLoader: DefinitionLoader,
    private readonly executorFactory: ExecutorFactory,
    private readonly interactionsLoader: InteractionsLoader,
    private readonly interactionsSorter: InteractionsLoader,
    private readonly stateEvaluator: StateEvaluator
  ) {}

  contract(contractTxId: string): Contract {
    return null;
  }
}
