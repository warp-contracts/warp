import { JWKInterface } from 'arweave/node/lib/wallet';
import { SerializationFormat } from 'core/modules/StateEvaluator';
import { CustomSignature } from '../../contract/Signature';
import { Source } from './Source';
import { EvaluationOptions } from '../../core/modules/StateEvaluator';
import { WarpPluginType } from '../../core/WarpPlugin';

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

export type EvaluationManifest = {
  evaluationOptions: Partial<EvaluationOptions>;
  plugins?: WarpPluginType[];
};

export const BUNDLR_NODES = ['node1', 'node2'] as const;
export type BundlrNodeType = typeof BUNDLR_NODES[number];

export interface CommonContractData<T extends SerializationFormat> {
  wallet: ArWallet | CustomSignature;
  stateFormat: T;
  initState: T extends SerializationFormat.JSON ? string : Buffer;
  tags?: Tags;
  transfer?: ArTransfer;
  data?: {
    'Content-Type': string;
    body: string | Uint8Array | ArrayBuffer;
  };
  evaluationManifest?: EvaluationManifest;
}

export interface ContractData<T extends SerializationFormat> extends CommonContractData<T> {
  src: string | Buffer;
  wasmSrcCodeDir?: string;
  wasmGlueCode?: string;
}

export interface FromSrcTxContractData<T extends SerializationFormat> extends CommonContractData<T> {
  srcTxId: string;
}

export interface ContractDeploy {
  contractTxId: string;
  srcTxId?: string;
}

export interface CreateContract extends Source {
  deploy<T extends SerializationFormat>(
    contractData: ContractData<T>,
    disableBundling?: boolean
  ): Promise<ContractDeploy>;

  deployFromSourceTx<T extends SerializationFormat>(
    contractData: FromSrcTxContractData<T>,
    disableBundling?: boolean
  ): Promise<ContractDeploy>;

  deployBundled(rawDataItem: Buffer): Promise<ContractDeploy>;

  register(id: string, bundlrNode: BundlrNodeType): Promise<ContractDeploy>;
}
