import { JWKInterface } from 'arweave/node/lib/wallet';

export type Tags = { name: string; value: string }[];

export type ArWallet = JWKInterface | 'use_wallet';

export type ContractType = 'js' | 'wasm';

export type ArTransfer = {
  target: string;
  winstonQty: string;
};

export const emptyTransfer: ArTransfer = {
  target: '',
  winstonQty: '0'
};

export interface CommonContractData {
  wallet: ArWallet;
  initState: string;
  tags?: Tags;
  transfer?: ArTransfer;
}

export interface ContractData extends CommonContractData {
  src: string | Buffer;
  wasmSrcCodeDir?: string;
  wasmGlueCode?: string;
}

export interface FromSrcTxContractData extends CommonContractData {
  srcTxId: string;
  contractType: ContractType;
  wasmLang: string | null;
}

export interface CreateContract {
  deploy(contractData: ContractData): Promise<string>;

  deployFromSourceTx(contractData: FromSrcTxContractData): Promise<string>;
}
