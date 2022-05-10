import Arweave from 'arweave';
import {
  ArweaveGatewayInteractionsLoader,
  CacheableContractInteractionsLoader,
  ConfirmationStatus,
  ContractDefinitionLoader,
  DebuggableExecutorFactory,
  DefinitionLoader,
  ExecutorFactory,
  HandlerApi,
  InteractionsLoader,
  InteractionsSorter,
  MemBlockHeightSwCache,
  MemCache,
  RedstoneGatewayContractDefinitionLoader,
  RedstoneGatewayInteractionsLoader,
  SmartWeave,
  SourceType,
  StateEvaluator
} from '@smartweave';

export const R_GW_URL = 'https://d1o5nlqr4okus2.cloudfront.net';

export class SmartWeaveBuilder {
  private _definitionLoader?: DefinitionLoader;
  private _interactionsLoader?: InteractionsLoader;
  private _interactionsSorter?: InteractionsSorter;
  private _executorFactory?: ExecutorFactory<HandlerApi<unknown>>;
  private _stateEvaluator?: StateEvaluator;
  private _useRedstoneGwInfo = false;

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

  public useRedStoneGateway(
    confirmationStatus: ConfirmationStatus = null,
    source: SourceType = null,
    address = R_GW_URL
  ): SmartWeaveBuilder {
    this._interactionsLoader = new RedstoneGatewayInteractionsLoader(address, confirmationStatus, source);
    this._definitionLoader = new RedstoneGatewayContractDefinitionLoader(address, this._arweave, new MemCache());
    this._useRedstoneGwInfo = true;
    return this;
  }

  public useArweaveGateway(): SmartWeaveBuilder {
    this._definitionLoader = new ContractDefinitionLoader(this._arweave, new MemCache());
    this._interactionsLoader = new CacheableContractInteractionsLoader(
      new ArweaveGatewayInteractionsLoader(this._arweave),
      new MemBlockHeightSwCache(1)
    );
    this._useRedstoneGwInfo = false;
    return this;
  }

  public useRedStoneGwInfo(): SmartWeaveBuilder {
    this._useRedstoneGwInfo = true;
    return this;
  }

  build(): SmartWeave {
    return new SmartWeave(
      this._arweave,
      this._definitionLoader,
      this._interactionsLoader,
      this._interactionsSorter,
      this._executorFactory,
      this._stateEvaluator,
      this._useRedstoneGwInfo
    );
  }
}
