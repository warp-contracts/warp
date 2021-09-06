import { JWKInterface } from 'arweave/node/lib/wallet';

export type Tags = { name: string; value: string }[];

export type ArWallet = JWKInterface | 'use_wallet';

export type ArTransfer = {
  target: string;
  winstonQty: string;
};

export const emptyTransfer: ArTransfer = {
  target: '',
  winstonQty: '0'
};

export interface CommonContractData {
  wallet: ArWallet
  initState: string,
  tags?: Tags,
  transfer?: ArTransfer
}

export interface ContractData extends CommonContractData {
  src: string,
}

export interface FromSrcTxContractData extends CommonContractData {
  srcTxId: string,
}

export interface CreateContract {
  deploy(contractData: ContractData): Promise<string>;

  deployFromSourceTx(contractData: FromSrcTxContractData): Promise<string>;

  /**
   * TODO: I would like to add the contract upgrade feature here
   * -  as an "evolution" of the current "evolve" ;-)
   * @param contractTxId
   * @param contractData
   */
  update(contractTxId: string, contractData: ContractData): Promise<void>;
}
