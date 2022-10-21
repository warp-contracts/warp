/**
 * This type contains all data and meta-data of the given contact.
 */

import { ContractType } from '../contract/deploy/CreateContract';

export class ContractMetadata {
  dtor: number;
}

export type ContractSource = {
  src: string | null;
  srcBinary: Buffer | null;
  srcWasmLang: string | null;
  contractType: ContractType;
  srcTx: any;
  metadata?: ContractMetadata;
};

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
  contractTx: any;
  srcTx: any;
  testnet: string | null;
};
