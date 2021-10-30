import {
  ArTransfer,
  ArWallet,
  ContractCallStack,
  EvalStateResult,
  EvaluationOptions,
  GQLNodeInterface,
  InteractionResult,
  Tags
} from '@smartweave';
import { NetworkInfoInterface } from 'arweave/node/network';

export type CurrentTx = { interactionTxId: string; contractTxId: string };

/**
 * A base interface to be implemented by SmartWeave Contracts clients
 * - contains "low-level" methods that allow to interact with any contract
 */
export interface Contract<State = unknown> {
  /**
   * Returns the Arweave transaction id of this contract.
   */
  txId(): string;

  /**
   * Allows to connect {@link ArWallet} to a contract.
   * Connecting a wallet MAY be done before "viewState" (depending on contract implementation,
   * ie. whether called contract's function required "caller" info)
   * Connecting a wallet MUST be done before "writeInteraction".
   *
   * @param wallet - {@link ArWallet} that will be connected to this contract
   */
  connect(wallet: ArWallet): Contract<State>;

  /**
   * Allows to set ({@link EvaluationOptions})
   *
   * @param options - a set of {@link EvaluationOptions} that will overwrite current configuration
   */
  setEvaluationOptions(options: Partial<EvaluationOptions>): Contract<State>;

  /**
   * Returns state of the contract at required blockHeight.
   * Similar to {@link readContract} from the current version.
   *
   * @param blockHeight - block height at which state should be read. If not passed
   * current Arweave block height from the network info will be used.
   *
   * @param currentTx - a set of currently evaluating interactions, that should
   * be skipped during contract inner calls - to prevent the infinite call loop issue
   * (mostly related to contracts that use the Foreign Call Protocol)
   */
  readState(blockHeight?: number, currentTx?: CurrentTx[]): Promise<EvalStateResult<State>>;

  /**
   * Returns the "view" of the state, computed by the SWC -
   * ie. object that is a derivative of a current state and some specific
   * smart contract business logic.
   * Similar to the "interactRead" from the current SDK version.
   *
   * This method firstly evaluates the contract state to the requested block height.
   * Having the contract state on this block height - it then calls the contract's code
   * with specified input.
   *
   * @param input - the input to the contract - eg. function name and parameters
   * @param blockHeight - the height at which the contract state will be evaluated
   * before applying last interaction transaction - ie. transaction with 'input'
   * @param tags - a set of tags that can be added to the interaction transaction
   * @param transfer - additional {@link ArTransfer} data that can be attached to the interaction
   * transaction
   */
  viewState<Input = unknown, View = unknown>(
    input: Input,
    blockHeight?: number,
    tags?: Tags,
    transfer?: ArTransfer
  ): Promise<InteractionResult<State, View>>;

  /**
   * A version of the viewState method to be used from within the contract's source code.
   * The transaction passed as an argument is the currently processed interaction transaction.
   * The "caller" will be se to the owner of the interaction transaction, that
   * requires to call this method.
   *
   * note: calling "interactRead" from withing contract's source code was not previously possible -
   * this is a new feature.
   *
   * TODO: this should not be exposed in a public API - as it is supposed
   * to be used only by Handler code.
   */
  viewStateForTx<Input = unknown, View = unknown>(
    input: Input,
    transaction: GQLNodeInterface
  ): Promise<InteractionResult<State, View>>;

  dryWrite<Input>(input: Input, tags?: Tags, transfer?: ArTransfer): Promise<InteractionResult<State, unknown>>;

  dryWriteFromTx<Input>(
    input: Input,
    transaction: GQLNodeInterface,
    currentTx?: CurrentTx[]
  ): Promise<InteractionResult<State, unknown>>;

  /**
   * Writes a new "interaction" transaction - ie. such transaction that stores input for the contract.
   *
   * @param input -  new input to the contract that will be assigned with this interactions transaction
   * @param tags - additional tags that can be attached to the newly created interaction transaction
   * @param transfer - additional {@link ArTransfer} than can be attached to the interaction transaction
   * @param strict - transaction will be posted on Arweave only if the dry-run of the input result is "ok"
   */
  writeInteraction<Input = unknown>(
    input: Input,
    tags?: Tags,
    transfer?: ArTransfer,
    strict?: boolean
  ): Promise<string | null>;

  /**
   * Returns the full call tree report the last
   * interaction with contract (eg. after reading state)
   */
  getCallStack(): ContractCallStack;

  /**
   * Gets network info assigned to this contract.
   * Network info is refreshed between interactions with
   * given contract (eg. between consecutive calls to {@link Contract.readState})
   * but reused within given execution tree (ie. only "root" contract loads the
   * network info - eg. if readState calls other contracts, these calls will use the
   * "root" contract network info - so that the whole execution is performed with the
   * same network info)
   */
  getNetworkInfo(): NetworkInfoInterface;

  /**
   * Get the block height requested by user for the given interaction with contract
   * (eg. readState or viewState call)
   */
  getRootBlockHeight(): number | null;

  /**
   * Gets the parent contract - ie. contract that called THIS contract during the
   * state evaluation.
   */
  parent(): Contract | null;

  /**
   * Return the depth of the call to this contract.
   * Eg. 
   * 1. User calls ContractA.readState() - depth = 0
   * 2. ContractA.readState() calls ContractB.readState() - depth = 1
   * 3. ContractB.readState calls ContractC.readState() - depth = 2
   */
  callDepth(): number;

  /**
   * {@link EvaluationOptions} assigned to this contract.
   * The evaluation options for the child contracts are always
   * the same as the evaluation options of the root contract.
   */
  evaluationOptions(): EvaluationOptions;
}
