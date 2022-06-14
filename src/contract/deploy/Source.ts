import { SigningFunction } from 'contract/Contract';
import { ArWallet } from './CreateContract';
import { SourceData } from './impl/SourceImpl';

export interface Source {
  /**
   * allows to post contract source on Arweave
   * @param contractSource - contract source...
   */
  save(
    contractSource: SourceData,
    signer?: ArWallet | SigningFunction,
    useBundler?: boolean
  ): Promise<string | null>;
}
