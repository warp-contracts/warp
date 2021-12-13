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
 * Interface for all contracts the implement the {@link Evolve} feature.
 * Evolve is a feature that allows to change contract's source
 * code, without having to deploy a new contract.
 * See ({@link Evolve})
 */
export interface EvolvingContract {
  /**
   * allows to post new contract source on Arweave
   * @param newContractSource - new contract source...
   */
  saveNewSource(newContractSource: string): Promise<string | null>;

  /**
   * effectively evolves the contract to the source.
   * This requires the {@link saveNewSource} to be called first
   * and its transaction to be confirmed by the network.
   * @param newSrcTxId - result of the {@link saveNewSource} method call.
   */
  evolve(newSrcTxId: string): Promise<string | null>;
}

/**
 * Interface describing state for all Evolve-compatible contracts.
 */
export interface EvolveState {
  settings: any[] | unknown | null;
  /**
   * whether contract is allowed to evolve. seems to default to true..
   */
  canEvolve: boolean;

  /**
   * the transaction id of the Arweave transaction with the updated source code.
   */
  evolve: string;
}

/**
 * Interface describing base state for all PST contracts.
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
 * Profit Sharing Token contract.
 */
export interface PstContract extends Contract<PstState>, EvolvingContract {
  /**
   * return the current balance for the given wallet
   * @param target - wallet address
   */
  currentBalance(target: string): Promise<BalanceResult>;

  /**
   * returns the current contract state
   */
  currentState(): Promise<PstState>;

  /**
   * allows to transfer PSTs between wallets
   * @param transfer - data required to perform a transfer, see {@link transfer}
   */
  transfer(transfer: TransferInput): Promise<string | null>;
}
