import {
  BalanceResult,
  HandlerBasedContract,
  InvalidInteractionError,
  NoWalletError,
  PstContract,
  PstState,
  TransferInput
} from '@warp/contract';
import { Result } from 'neverthrow';

interface BalanceInput {
  function: string;
  target: string;
}

export class PstContractImpl extends HandlerBasedContract<PstState> implements PstContract {
  async currentBalance(target: string): Promise<BalanceResult> {
    const interactionResult = await this.viewState<BalanceInput, BalanceResult>({ function: 'balance', target });
    if (interactionResult.type !== 'ok') {
      throw Error(interactionResult.errorMessage);
    }
    return interactionResult.result;
  }

  async currentState(): Promise<PstState> {
    return (await super.readState()).state;
  }

  async transfer(transfer: TransferInput): Promise<Result<string, InvalidInteractionError | NoWalletError>> {
    return await this.writeInteraction<any>({ function: 'transfer', ...transfer });
  }
}
