import Arweave from 'arweave';
import { LevelDbCache } from '../cache/impl/LevelDbCache';
import { Contract, InnerCallData, InnerCallType } from '../contract/Contract';
import { CreateContract } from '../contract/deploy/CreateContract';
import { DefaultCreateContract } from '../contract/deploy/impl/DefaultCreateContract';
import { HandlerBasedContract } from '../contract/HandlerBasedContract';
import { PstContract } from '../contract/PstContract';
import { PstContractImpl } from '../contract/PstContractImpl';
import { GQLNodeInterface } from '../legacy/gqlResult';
import { MigrationTool } from '../contract/migration/MigrationTool';
import { Testing } from '../contract/testing/Testing';
import { DefinitionLoader } from './modules/DefinitionLoader';
import { ExecutorFactory } from './modules/ExecutorFactory';
import { HandlerApi } from './modules/impl/HandlerExecutorFactory';
import { InteractionsLoader } from './modules/InteractionsLoader';
import { EvalStateResult, StateEvaluator } from './modules/StateEvaluator';
import { WarpBuilder } from './WarpBuilder';
import {SortKeyCache} from "../cache/SortKeyCache";

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
  readonly createContract: CreateContract;
  readonly migrationTool: MigrationTool;
  readonly testing: Testing;

  constructor(
    readonly arweave: Arweave,
    readonly stateCache: SortKeyCache<EvalStateResult<unknown>>,
    readonly definitionLoader: DefinitionLoader,
    readonly interactionsLoader: InteractionsLoader,
    readonly executorFactory: ExecutorFactory<HandlerApi<unknown>>,
    readonly stateEvaluator: StateEvaluator,
    readonly environment: WarpEnvironment = 'custom'
  ) {
    this.createContract = new DefaultCreateContract(arweave, this);
    this.migrationTool = new MigrationTool(arweave, stateCache);
    this.testing = new Testing(arweave);
  }

  static builder(
    arweave: Arweave,
    cache: SortKeyCache<EvalStateResult<unknown>>,
    environment: WarpEnvironment
  ): WarpBuilder {
    return new WarpBuilder(arweave, cache, environment);
  }

  /**
   * Allows to connect to any contract using its transaction id.
   * @param contractTxId
   * @param callingContract
   */
  contract<State>(contractTxId: string, callingContract?: Contract, innerCallData?: InnerCallData): Contract<State> {
    return new HandlerBasedContract<State>(contractTxId, this, callingContract, innerCallData);
  }

  /**
   * Allows to connect to a contract that conforms to the Profit Sharing Token standard
   * @param contractTxId
   */
  pst(contractTxId: string): PstContract {
    return new PstContractImpl(contractTxId, this);
  }
}
