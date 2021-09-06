import { Contract, InteractionResult } from '@smartweave';

export interface BalanceResult {
  target: string;
  ticker: string;
  balance: number;
}

export interface PstState {
  ticker: string;
  owner: string;
  canEvolve: boolean;
  balances: {
    [key: string]: number;
  };
}

export interface TransferInput {
  target: string;
  qty: number;
}

/**
 * An type of contract designed specifically for the interaction with
 * Profit Sharing Tokens.
 */
export interface PstContract extends Contract {
  currentBalance(target: string): Promise<InteractionResult<PstState, BalanceResult>>;

  currentState(): Promise<PstState>;

  transfer(transfer: TransferInput): Promise<string | null>;
}
