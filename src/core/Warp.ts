import Arweave from 'arweave';
import { Contract, InnerCallData } from '../contract/Contract';
import {
  ArWallet,
  ContractData,
  ContractDeploy,
  CreateContract,
  FromSrcTxContractData
} from '../contract/deploy/CreateContract';
import { DefaultCreateContract } from '../contract/deploy/impl/DefaultCreateContract';
import { HandlerBasedContract } from '../contract/HandlerBasedContract';
import { PstContract } from '../contract/PstContract';
import { PstContractImpl } from '../contract/PstContractImpl';
import { Testing, Wallet } from '../contract/testing/Testing';
import { DefinitionLoader } from './modules/DefinitionLoader';
import { ExecutorFactory } from './modules/ExecutorFactory';
import { HandlerApi } from './modules/impl/HandlerExecutorFactory';
import { InteractionsLoader } from './modules/InteractionsLoader';
import { EvalStateResult, StateEvaluator } from './modules/StateEvaluator';
import { WarpBuilder } from './WarpBuilder';
import { WarpPluginType, WarpPlugin, knownWarpPlugins } from './WarpPlugin';
import { SortKeyCache } from '../cache/SortKeyCache';
import { ContractDefinition } from './ContractDefinition';
import { SignatureType } from '../contract/Signature';
import { SourceData } from '../contract/deploy/impl/SourceImpl';
import Transaction from 'arweave/node/lib/transaction';

export type WarpEnvironment = 'local' | 'testnet' | 'mainnet' | 'custom';

/**
 * The Warp "motherboard" ;-).
 * This is the base class that supplies the implementation of the SmartWeave protocol
 * Allows to plug-in different implementation of all the modules defined in the constructor.
 *
 * After being fully configured, it allows to "connect" to
 * contract and perform operations on them (see {@link Contract})
 */
export class Warp {
  /**
   * @deprecated createContract will be a private field, please use its methods directly e.g. await warp.deploy(...)
   */
  readonly createContract: CreateContract;
  readonly testing: Testing;

  private readonly plugins: Map<WarpPluginType, WarpPlugin<unknown, unknown>> = new Map();

  constructor(
    readonly arweave: Arweave,
    readonly definitionLoader: DefinitionLoader,
    readonly interactionsLoader: InteractionsLoader,
    readonly executorFactory: ExecutorFactory<HandlerApi<unknown>>,
    readonly stateEvaluator: StateEvaluator,
    readonly environment: WarpEnvironment = 'custom'
  ) {
    this.createContract = new DefaultCreateContract(arweave, this);
    this.testing = new Testing(arweave);
  }

  static builder(
    arweave: Arweave,
    stateCache: SortKeyCache<EvalStateResult<unknown>>,
    environment: WarpEnvironment
  ): WarpBuilder {
    return new WarpBuilder(arweave, stateCache, environment);
  }

  /**
   * Allows to connect to any contract using its transaction id.
   * @param contractTxId
   * @param callingContract
   */
  contract<State>(contractTxId: string, callingContract?: Contract, innerCallData?: InnerCallData): Contract<State> {
    return new HandlerBasedContract<State>(contractTxId, this, callingContract, innerCallData);
  }

  async deploy(contractData: ContractData, disableBundling?: boolean): Promise<ContractDeploy> {
    return await this.createContract.deploy(contractData, disableBundling);
  }

  async deployFromSourceTx(contractData: FromSrcTxContractData, disableBundling?: boolean): Promise<ContractDeploy> {
    return await this.createContract.deployFromSourceTx(contractData, disableBundling);
  }

  async deployBundled(rawDataItem: Buffer): Promise<ContractDeploy> {
    return await this.createContract.deployBundled(rawDataItem);
  }

  async createSourceTx(sourceData: SourceData, wallet: ArWallet | SignatureType): Promise<Transaction> {
    return await this.createContract.createSourceTx(sourceData, wallet);
  }

  async saveSourceTx(srcTx: Transaction, disableBundling?: boolean): Promise<string> {
    return await this.createContract.saveSourceTx(srcTx, disableBundling);
  }

  /**
   * Allows to connect to a contract that conforms to the Profit Sharing Token standard
   * @param contractTxId
   */
  pst(contractTxId: string): PstContract {
    return new PstContractImpl(contractTxId, this);
  }

  useStateCache(stateCache: SortKeyCache<EvalStateResult<unknown>>): Warp {
    this.stateEvaluator.setCache(stateCache);
    return this;
  }

  useContractCache(contractsCache: SortKeyCache<ContractDefinition<any>>): Warp {
    this.definitionLoader.setCache(contractsCache);
    return this;
  }

  use(plugin: WarpPlugin<unknown, unknown>): Warp {
    const pluginType = plugin.type();
    if (!knownWarpPlugins.some((p) => p == pluginType)) {
      throw new Error(`Unknown plugin type ${pluginType}.`);
    }
    this.plugins.set(pluginType, plugin);

    return this;
  }

  hasPlugin(type: WarpPluginType): boolean {
    return this.plugins.has(type);
  }

  loadPlugin<P, Q>(type: WarpPluginType): WarpPlugin<P, Q> {
    if (!this.hasPlugin(type)) {
      throw new Error(`Plugin ${type} not registered.`);
    }

    return this.plugins.get(type) as WarpPlugin<P, Q>;
  }

  async generateWallet(): Promise<Wallet> {
    const wallet = await this.arweave.wallets.generate();

    if (await this.testing.isArlocal()) {
      await this.testing.addFunds(wallet);
    }

    return {
      jwk: wallet,
      address: await this.arweave.wallets.jwkToAddress(wallet)
    };
  }
}
