/**
 * contains all data and meta-data of the given contact.
 */
export type ContractDefinition<State> = {
  txId: string;
  srcTxId: string;
  src: string;
  initState: State;
  minFee: string;
  owner: string;
};
