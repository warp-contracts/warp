import { BadGatewayResponse } from '@warp';
import { BalanceResult, HandlerBasedContract, NoWallet, PstContract, PstState, TransferInput } from '@warp/contract';
import { InvalidInteraction, UnexpectedInteractionError } from '@warp/core';
import { AppError } from '@warp/utils';
import { err, ok, Result } from 'neverthrow';

interface BalanceInput {
  function: string;
  target: string;
}

export class PstContractImpl extends HandlerBasedContract<PstState> implements PstContract {
  async currentBalance(
    target: string
  ): Promise<Result<BalanceResult, AppError<UnexpectedInteractionError | BadGatewayResponse | InvalidInteraction>>> {
    const interactionResult = await this.viewState<BalanceInput, BalanceResult>({ function: 'balance', target });

    if (interactionResult.isErr()) {
      return err(interactionResult.error);
    }

    return ok(interactionResult.value.result);
  }

  async currentState(): Promise<Result<PstState, AppError<UnexpectedInteractionError | BadGatewayResponse>>> {
    const state = await super.readState();
    return state.isErr() ? err(state.error) : ok(state.value.state);
  }

  async transfer(
    transfer: TransferInput
  ): Promise<
    Result<string, AppError<UnexpectedInteractionError | InvalidInteraction | NoWallet | BadGatewayResponse>>
  > {
    return await this.writeInteraction<any>({ function: 'transfer', ...transfer });
  }
}
