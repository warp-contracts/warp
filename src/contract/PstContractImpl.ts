import { BalanceResult, HandlerBasedContract, PstContract, PstState, TransferInput } from '@smartweave/contract';
import { InteractionResult } from '@smartweave/core';

interface BalanceInput {
  target: string;
}

export class PstContractImpl extends HandlerBasedContract<PstState> implements PstContract {
  async currentBalance(target: string): Promise<InteractionResult<PstState, BalanceResult>> {
    return await super.viewState<BalanceInput, BalanceResult>({ target });
  }

  async currentState(): Promise<PstState> {
    return (await super.readState()).state;
  }

  async transfer(transfer: TransferInput): Promise<string | null> {
    return await super.writeInteraction<any>({ function: 'transfer', ...transfer });
  }
}
