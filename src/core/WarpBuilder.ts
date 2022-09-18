import Arweave from 'arweave';
import { MemCache } from '../cache/impl/MemCache';
import { LevelDbCache } from '../cache/impl/LevelDbCache';
import { DebuggableExecutorFactory } from '../plugins/DebuggableExecutorFactor';
import { DefinitionLoader } from './modules/DefinitionLoader';
import { ExecutorFactory } from './modules/ExecutorFactory';
import { ArweaveGatewayInteractionsLoader } from './modules/impl/ArweaveGatewayInteractionsLoader';
import { CacheableInteractionsLoader } from './modules/impl/CacheableInteractionsLoader';
import { ContractDefinitionLoader } from './modules/impl/ContractDefinitionLoader';
import { HandlerApi } from './modules/impl/HandlerExecutorFactory';
import { WarpGatewayContractDefinitionLoader } from './modules/impl/WarpGatewayContractDefinitionLoader';
import { WarpGatewayInteractionsLoader } from './modules/impl/WarpGatewayInteractionsLoader';
import { InteractionsLoader } from './modules/InteractionsLoader';
import { StateEvaluator, EvalStateResult } from './modules/StateEvaluator';
import { WarpEnvironment, Warp } from './Warp';
import { GatewayOptions } from './WarpFactory';

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

  public useWarpGateway(gatewayOptions: GatewayOptions): WarpBuilder {
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
    this._interactionsLoader = new CacheableInteractionsLoader(
      new ArweaveGatewayInteractionsLoader(this._arweave, this._environment)
    );
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
