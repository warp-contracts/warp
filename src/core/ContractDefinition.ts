/**
 * This type contains all data and meta-data of the given contact.
 */
import { ContractType } from './modules/CreateContract';

export type ContractDefinition<State> = {
  txId: string;
  srcTxId: string;
  src: Buffer | string;
  srcWasmLang: string | null;
  initState: State;
  minFee: string;
  owner: string;
  contractType: ContractType;
};
