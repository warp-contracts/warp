import { ArWallet } from '@smartweave/core';
import { SigningFunction } from './Contract';
import { SaveSourceData } from './SaveSourceImpl';

export interface SaveSource {
  /**
   * allows to post contract source on Arweave
   * @param newContractSource - new contract source...
   */
  saveSource(
    contractSource: SaveSourceData,
    signer: ArWallet | SigningFunction,
    useBundler?: boolean
  ): Promise<string | null>;
}
