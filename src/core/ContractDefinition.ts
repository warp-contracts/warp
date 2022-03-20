/**
 * This type contains all data and meta-data of the given contact.
 */
import { ContractType } from './modules/CreateContract';

export class ContractMetadata {
  dtor: number;
}

export type ContractDefinition<State> = {
  txId: string;
  srcTxId: string;
  src: string | null;
  srcBinary: Buffer | null;
  srcWasmLang: string | null;
  initState: State;
  minFee: string;
  owner: string;
  contractType: ContractType;
  metadata?: ContractMetadata;
};
