import { JWKInterface } from 'arweave/node/lib/wallet';
import { Signature } from 'contract/Contract';

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
  wallet: ArWallet | Signature;
  initState: string;
  tags?: Tags;
  transfer?: ArTransfer;
  data?: {
    'Content-Type': string;
    body: string | Uint8Array | ArrayBuffer;
  };
}

export interface ContractData extends CommonContractData {
  src: string | Buffer;
  wasmSrcCodeDir?: string;
  wasmGlueCode?: string;
}

export interface FromSrcTxContractData extends CommonContractData {
  srcTxId: string;
}

export interface ContractDeploy {
  contractTxId: string;
  srcTxId: string;
}
export interface CreateContract {
  deploy(contractData: ContractData, disableBundling?: boolean): Promise<ContractDeploy>;

  deployFromSourceTx(contractData: FromSrcTxContractData, disableBundling?: boolean): Promise<ContractDeploy>;
}
