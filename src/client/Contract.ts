import { EvalStateResult, EvaluationOptions, InteractionResult, InteractionTx } from '@smartweave';
import { JWKInterface } from 'arweave/node/lib/wallet';

/**
 * A base interface to be implemented by SmartWeave Contracts clients.
 *
 * TODO: still to decide - whether create separate SwcClient for each contract (i.e. each contractTxId)
 * - and stop passing `contractTxId` param in the interface methods
 * OR
 * keep it as is (one instance of client can be used for interaction with multiple contracts
 * - this introduces some issues with generic types - as we cannot declare `State` and `Api' types at interface level).
 */
export interface Contract {
  /**
   * Returns state of the contract at required blockHeight.
   * Similar to {@link readContract} from the current version.
   */
  readState<State = any>(
    contractTxId: string,
    blockHeight?: number,
    currentTx?: { interactionTxId: string; contractTxId: string }[],
    evaluationOptions?: EvaluationOptions
  ): Promise<EvalStateResult<State>>;

  /**
   * Returns the view of the state, computed by the SWC.
   * Similar to the {@link interactRead} from the current SDK version.
   */
  viewState<Input = any, View = any>(
    contractTxId: string,
    input: Input,
    wallet: JWKInterface,
    blockHeight?: number,
    evaluationOptions?: EvaluationOptions
  ): Promise<InteractionResult<any, View>>;

  /**
   * A version of the viewState method to be used from within the contract's source code.
   * The transaction passed as an argument is the currently processed interaction transaction.
   *
   * note: calling "interactRead" from withing contract's source code was not previously possible -
   * this is a new feature.
   */
  viewStateForTx<Input = any, View = any>(
    contractTxId: string,
    input: Input,
    transaction: InteractionTx,
    evaluationOptions?: EvaluationOptions
  ): Promise<InteractionResult<any, View>>;

  /**
   * Writes a new "interaction" transaction - ie. such transaction that stores input for the contract.
   */
  writeInteraction<Input = any>(contractTxId: string, wallet: JWKInterface, input: Input);
}
