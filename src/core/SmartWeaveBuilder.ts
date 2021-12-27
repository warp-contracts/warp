import Arweave from 'arweave';
import {
  CacheableContractInteractionsLoader,
  DebuggableExecutorFactory,
  DefinitionLoader,
  ExecutorFactory,
  HandlerApi,
  InteractionsLoader,
  InteractionsSorter,
  MemBlockHeightSwCache,
  SmartWeave,
  StateEvaluator
} from '@smartweave';

export class SmartWeaveBuilder {
  private _definitionLoader?: DefinitionLoader;
  private _interactionsLoader?: InteractionsLoader;
  private _interactionsSorter?: InteractionsSorter;
  private _executorFactory?: ExecutorFactory<HandlerApi<unknown>>;
  private _stateEvaluator?: StateEvaluator;

  constructor(private readonly _arweave: Arweave) {}

  public setDefinitionLoader(value: DefinitionLoader): SmartWeaveBuilder {
    this._definitionLoader = value;
    return this;
  }

  public setInteractionsLoader(value: InteractionsLoader): SmartWeaveBuilder {
    this._interactionsLoader = value;
    return this;
  }

  public setCacheableInteractionsLoader(
    value: InteractionsLoader,
    maxStoredInMemoryBlockHeights = 1
  ): SmartWeaveBuilder {
    this._interactionsLoader = new CacheableContractInteractionsLoader(
      value,
      new MemBlockHeightSwCache(maxStoredInMemoryBlockHeights)
    );
    return this;
  }

  public setInteractionsSorter(value: InteractionsSorter): SmartWeaveBuilder {
    this._interactionsSorter = value;
    return this;
  }

  public setExecutorFactory(value: ExecutorFactory<HandlerApi<unknown>>): SmartWeaveBuilder {
    this._executorFactory = value;
    return this;
  }

  public setStateEvaluator(value: StateEvaluator): SmartWeaveBuilder {
    this._stateEvaluator = value;
    return this;
  }

  public overwriteSource(sourceCode: { [key: string]: string }): SmartWeave {
    if (this._executorFactory == null) {
      throw new Error('Set base ExecutorFactory first');
    }
    this._executorFactory = new DebuggableExecutorFactory(this._executorFactory, sourceCode);
    return this.build();
  }

  build(): SmartWeave {
    return new SmartWeave(
      this._arweave,
      this._definitionLoader,
      this._interactionsLoader,
      this._interactionsSorter,
      this._executorFactory,
      this._stateEvaluator
    );
  }
}
