import { Signature, SigningFunction } from '../../contract/Contract';
import { ArWallet } from './CreateContract';
import { SourceData } from './impl/SourceImpl';
import { WarpEnvironment } from '../../core/Warp';

export interface Source {
  /**
   * allows to post contract source on Arweave
   * @param contractSource - contract source...
   */
  save(
    contractSource: SourceData,
    env: WarpEnvironment,
    signer?: ArWallet | Signature,
    useBundler?: boolean
  ): Promise<string | null>;
}
