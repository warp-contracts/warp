import {
  DefinitionLoader,
  EvalStateResult,
  ExecutorFactory,
  HandlerApi,
  InteractionsLoader,
  StateEvaluator,
  WarpBuilder
} from '@warp/core';
import Arweave from 'arweave';
import {
  Contract,
  CreateContract,
  DefaultCreateContract,
  HandlerBasedContract,
  PstContract,
  PstContractImpl
} from '@warp/contract';
import { GQLNodeInterface } from '@warp/legacy';
import { MigrationTool } from '../contract/migration/MigrationTool';
import { LevelDbCache } from '@warp/cache';
import { Testing } from '../contract/testing/Testing';

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
    readonly levelDb: LevelDbCache<EvalStateResult<unknown>>,
    readonly definitionLoader: DefinitionLoader,
    readonly interactionsLoader: InteractionsLoader,
    readonly executorFactory: ExecutorFactory<HandlerApi<unknown>>,
    readonly stateEvaluator: StateEvaluator,
    readonly environment: WarpEnvironment = 'custom'
  ) {
    this.createContract = new DefaultCreateContract(arweave, this);
    this.migrationTool = new MigrationTool(arweave, levelDb);
    this.testing = new Testing(arweave);
  }

  static builder(
    arweave: Arweave,
    cache: LevelDbCache<EvalStateResult<unknown>>,
    environment: WarpEnvironment
  ): WarpBuilder {
    return new WarpBuilder(arweave, cache, environment);
  }

  /**
   * Allows to connect to any contract using its transaction id.
   * @param contractTxId
   * @param callingContract
   */
  contract<State>(
    contractTxId: string,
    callingContract?: Contract,
    callingInteraction?: GQLNodeInterface
  ): Contract<State> {
    return new HandlerBasedContract<State>(contractTxId, this, callingContract, callingInteraction);
  }

  /**
   * Allows to connect to a contract that conforms to the Profit Sharing Token standard
   * @param contractTxId
   */
  pst(contractTxId: string): PstContract {
    return new PstContractImpl(contractTxId, this);
  }
}
