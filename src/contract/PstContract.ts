import { Contract } from '@smartweave';

/**
 * The result from the "balance" view method on the PST Contract.
 */
export interface BalanceResult {
  target: string;
  ticker: string;
  balance: number;
}

/**
 * Interface for all contracts the implement the {@link Evolve} feature
 */
export interface EvolvingContract {
  saveNewSource(newContractSource: string): Promise<string | null>;

  evolve(newSrcTxId: string): Promise<string | null>;
}

/**
 * Interface describing state for all Evolve-compatible contracts.
 * Evolve is a feature that allows to change contract's source
 * code, without deploying a new contract.
 * See ({@link Evolve})
 */
export interface EvolveState {
  settings: any[] | unknown | null;
  canEvolve: boolean; // whether contract is allowed to evolve. seems to default to true..
  evolve: string; // the transaction id of the Arweave transaction with the updated source code. odd naming convention..
}

/**
 * Interface describing state for all PST contracts.
 */
export interface PstState extends EvolveState {
  ticker: string;
  owner: string;
  balances: {
    [key: string]: number;
  };
}

/**
 * Interface describing data required for making a transfer
 */
export interface TransferInput {
  target: string;
  qty: number;
}

/**
 * A type of {@link Contract} designed specifically for the interaction with
 * Profit Sharing Tokens.
 */
export interface PstContract extends Contract, EvolvingContract {
  currentBalance(target: string): Promise<BalanceResult>;

  currentState(): Promise<PstState>;

  transfer(transfer: TransferInput): Promise<string | null>;
}
