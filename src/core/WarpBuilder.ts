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
  Warp,
  SourceType,
  StateEvaluator
} from '@warp';

export const R_GW_URL = 'https://d1o5nlqr4okus2.cloudfront.net';

export class WarpBuilder {
  private _definitionLoader?: DefinitionLoader;
  private _interactionsLoader?: InteractionsLoader;
  private _interactionsSorter?: InteractionsSorter;
  private _executorFactory?: ExecutorFactory<HandlerApi<unknown>>;
  private _stateEvaluator?: StateEvaluator;
  private _useRedstoneGwInfo = false;

  constructor(private readonly _arweave: Arweave) {}

  public setDefinitionLoader(value: DefinitionLoader): WarpBuilder {
    this._definitionLoader = value;
    return this;
  }

  public setInteractionsLoader(value: InteractionsLoader): WarpBuilder {
    this._interactionsLoader = value;
    return this;
  }

  public setCacheableInteractionsLoader(
    value: InteractionsLoader,
    maxStoredInMemoryBlockHeights = 1
  ): WarpBuilder {
    this._interactionsLoader = new CacheableContractInteractionsLoader(
      value,
      new MemBlockHeightSwCache(maxStoredInMemoryBlockHeights)
    );
    return this;
  }

  public setInteractionsSorter(value: InteractionsSorter): WarpBuilder {
    this._interactionsSorter = value;
    return this;
  }

  public setExecutorFactory(value: ExecutorFactory<HandlerApi<unknown>>): WarpBuilder {
    this._executorFactory = value;
    return this;
  }

  public setStateEvaluator(value: StateEvaluator): WarpBuilder {
    this._stateEvaluator = value;
    return this;
  }

  public overwriteSource(sourceCode: { [key: string]: string }): Warp {
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
  ): WarpBuilder {
    this._interactionsLoader = new RedstoneGatewayInteractionsLoader(address, confirmationStatus, source);
    this._definitionLoader = new RedstoneGatewayContractDefinitionLoader(address, this._arweave, new MemCache());
    this._useRedstoneGwInfo = true;
    return this;
  }

  public useArweaveGateway(): WarpBuilder {
    this._definitionLoader = new ContractDefinitionLoader(this._arweave, new MemCache());
    this._interactionsLoader = new CacheableContractInteractionsLoader(
      new ArweaveGatewayInteractionsLoader(this._arweave),
      new MemBlockHeightSwCache(1)
    );
    this._useRedstoneGwInfo = false;
    return this;
  }

  public useRedStoneGwInfo(): WarpBuilder {
    this._useRedstoneGwInfo = true;
    return this;
  }

  build(): Warp {
    return new Warp(
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
