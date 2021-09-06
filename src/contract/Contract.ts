import {
  ArTransfer,
  ArWallet,
  EvalStateResult,
  EvaluationOptions,
  InteractionResult,
  InteractionTx,
  Tags
} from '@smartweave';

/**
 * A base interface to be implemented by SmartWeave Contracts clients
 * - contains "low-level" methods that allow to interact with any contract
 */
export interface Contract<State = unknown> {
  /**
   * Returns transaction id of this contract.
   */
  txId(): string;

  /**
   * Allows to connect wallet to a contract.
   * Connecting a wallet MAY be done before "viewState" (depending on contract implementation,
   * ie. whether called contract's function required "caller" info)
   * Connecting a wallet MUST be done before "writeInteraction".
   */
  connect(wallet: ArWallet): Contract<State>;

  /**
   * Allows to set ({@link EvaluationOptions})
   */
  setEvaluationOptions(options: Partial<EvaluationOptions>): Contract<State>;

  /**
   * Returns state of the contract at required blockHeight.
   * Similar to {@link readContract} from the current version.
   */
  readState(
    blockHeight?: number,
    currentTx?: { interactionTxId: string; contractTxId: string }[]
  ): Promise<EvalStateResult<State>>;

  /**
   * Returns the "view" of the state, computed by the SWC -
   * ie. object that is a derivative of a current state and some specific
   * smart contract business logic.
   * Similar to the "interactRead" from the current SDK version.
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
   */
  viewStateForTx<Input = unknown, View = unknown>(
    input: Input,
    transaction: InteractionTx
  ): Promise<InteractionResult<State, View>>;

  /**
   * Writes a new "interaction" transaction - ie. such transaction that stores input for the contract.
   */
  writeInteraction<Input = unknown>(input: Input, tags?: Tags, transfer?: ArTransfer): Promise<string | null>;
}
