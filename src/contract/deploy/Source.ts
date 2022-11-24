import { ArWallet } from './CreateContract';
import { SourceData } from './impl/SourceImpl';
import { WarpEnvironment } from '../../core/Warp';
import { SignatureType } from '../../contract/Signature';

export interface Source {
  /**
   * allows to post contract source on Arweave
   * @param contractSource - contract source...
   */
  save(
    contractSource: SourceData,
    env: WarpEnvironment,
    signer?: ArWallet | SignatureType,
    useBundler?: boolean
  ): Promise<string | null>;
}
