import { EvalStateResult, EvaluationOptions, HandlerApi, InteractionResult, InteractionTx } from '@smartweave';
import { JWKInterface } from 'arweave/node/lib/wallet';

/**
 * A base interface to be implemented by SmartWeave Contracts clients.
 */
export interface Contract<State = unknown> {
  connect(wallet: JWKInterface): Contract<State>;
  /**
   * Returns state of the contract at required blockHeight.
   * Similar to {@link readContract} from the current version.
   */
  readState(
    blockHeight?: number,
    currentTx?: { interactionTxId: string; contractTxId: string }[],
    evaluationOptions?: EvaluationOptions
  ): Promise<EvalStateResult<State>>;

  /**
   * Returns the view of the state, computed by the SWC.
   * Similar to the {@link interactRead} from the current SDK version.
   */
  viewState<Input, View>(
    input: Input,
    blockHeight?: number,
    evaluationOptions?: EvaluationOptions
  ): Promise<InteractionResult<State, View>>;

  /**
   * A version of the viewState method to be used from within the contract's source code.
   * The transaction passed as an argument is the currently processed interaction transaction.
   *
   * note: calling "interactRead" from withing contract's source code was not previously possible -
   * this is a new feature.
   */
  viewStateForTx<Input, View>(
    input: Input,
    transaction: InteractionTx,
    evaluationOptions?: EvaluationOptions
  ): Promise<InteractionResult<State, View>>;

  /**
   * Writes a new "interaction" transaction - ie. such transaction that stores input for the contract.
   */
  writeInteraction<Input>(input: Input);
}
