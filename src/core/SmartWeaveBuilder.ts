import Arweave from 'arweave';
import {
  ArweaveGatewayInteractionsLoader,
  ConfirmationStatus,
  ContractDefinitionLoader,
  DebuggableExecutorFactory,
  DefinitionLoader,
  ExecutorFactory,
  HandlerApi,
  InteractionsLoader,
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
    return this;
  }

  public useArweaveGateway(): SmartWeaveBuilder {
    this._definitionLoader = new ContractDefinitionLoader(this._arweave, new MemCache());
    this._interactionsLoader = new ArweaveGatewayInteractionsLoader(this._arweave);
    return this;
  }

  build(): SmartWeave {
    return new SmartWeave(
      this._arweave,
      this._definitionLoader,
      this._interactionsLoader,
      this._executorFactory,
      this._stateEvaluator
    );
  }
}
