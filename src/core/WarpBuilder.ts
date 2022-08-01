import Arweave from 'arweave';
import {
  ArweaveGatewayInteractionsLoader,
  CacheableInteractionsLoader,
  CacheOptions,
  ConfirmationStatus,
  ContractDefinitionLoader,
  DebuggableExecutorFactory,
  DefinitionLoader,
  EvalStateResult,
  ExecutorFactory,
  GatewayOptions,
  HandlerApi,
  InteractionsLoader,
  LevelDbCache,
  MemCache,
  SourceType,
  StateEvaluator,
  Warp,
  WarpEnvironment,
  WarpGatewayContractDefinitionLoader,
  WarpGatewayInteractionsLoader
} from '@warp';

export const WARP_GW_URL = 'https://d1o5nlqr4okus2.cloudfront.net';

export class WarpBuilder {
  private _definitionLoader?: DefinitionLoader;
  private _interactionsLoader?: InteractionsLoader;
  private _executorFactory?: ExecutorFactory<HandlerApi<unknown>>;
  private _stateEvaluator?: StateEvaluator;

  constructor(
    private readonly _arweave: Arweave,
    private readonly _cache: LevelDbCache<EvalStateResult<unknown>>,
    private readonly _environment: WarpEnvironment = 'custom'
  ) {}

  public setDefinitionLoader(value: DefinitionLoader): WarpBuilder {
    this._definitionLoader = value;
    return this;
  }

  public setInteractionsLoader(value: InteractionsLoader): WarpBuilder {
    this._interactionsLoader = value;
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

  public useWarpGateway(cacheOptions: CacheOptions, gatewayOptions: GatewayOptions): WarpBuilder {
    this._interactionsLoader = new CacheableInteractionsLoader(
      new WarpGatewayInteractionsLoader(
        gatewayOptions.address,
        gatewayOptions.confirmationStatus,
        gatewayOptions.source
      )
    );
    this._definitionLoader = new WarpGatewayContractDefinitionLoader(
      gatewayOptions.address,
      this._arweave,
      new MemCache()
    );
    return this;
  }

  public useArweaveGateway(): WarpBuilder {
    this._definitionLoader = new ContractDefinitionLoader(this._arweave, new MemCache());
    this._interactionsLoader = new CacheableInteractionsLoader(new ArweaveGatewayInteractionsLoader(this._arweave));
    return this;
  }

  build(): Warp {
    return new Warp(
      this._arweave,
      this._cache,
      this._definitionLoader,
      this._interactionsLoader,
      this._executorFactory,
      this._stateEvaluator,
      this._environment
    );
  }
}
