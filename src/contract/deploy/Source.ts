import { ArWallet } from './CreateContract';
import { SourceData } from './impl/SourceImpl';
import { CustomSignature } from '../../contract/Signature';
import { Transaction } from '../../utils/types/arweave-types';
export interface Source {
  /**
   * allows to create contract source
   * @param sourceData - contract source data
   * @param wallet - either Arweave wallet or custom signature type
   */
  createSourceTx(sourceData: SourceData, wallet: ArWallet | CustomSignature): Promise<Transaction>;

  /**
   * allows to save contract source
   * @param sourceTx - contract source transaction
   * @param disableBundling = whether source should be deployed through bundlr using Warp Gateway
   */
  saveSourceTx(sourceTx: Transaction, disableBundling?: boolean): Promise<string>;
}
