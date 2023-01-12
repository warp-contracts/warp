import { Warp } from '../core/Warp';
import { ArWallet } from './deploy/CreateContract';
import { Transaction } from '../utils/types/arweave-types';
import { Signer } from './deploy/DataItem';

export type SignatureType = 'arweave' | 'ethereum';
export type SigningFunction = (tx: Transaction) => Promise<void>;
export type CustomSignature = { signer: SigningFunction; type: SignatureType };

/**
Different types which can be used to sign transaction or data item
- ArWallet - default option for signing Arweave transactions, either JWKInterface or 'use_wallet'
- CustomSignature - object with `signer` field - a custom signing function which takes transaction as a parameter and requires signing it 
  on the client side and `type` field of type SignatureType which indicates the wallet's chain, either 'arweave' or 'ethereum'
- Signer - arbundles specific class which allows to sign data items (only this type can be used when bundling is enabled and data items 
  are being created)
*/
export type SignatureProvider = ArWallet | CustomSignature | Signer;

export class Signature {
  signer: SigningFunction;
  type: SignatureType;
  readonly warp: Warp;

  constructor(warp: Warp, walletOrSignature: ArWallet | CustomSignature) {
    this.warp = warp;

    if (this.isCustomSignature(walletOrSignature)) {
      this.assertEnvForCustomSigner(walletOrSignature);
      this.signer = walletOrSignature.signer;
      this.type = walletOrSignature.type;
    } else {
      this.assignDefaultSigner(walletOrSignature);
    }
  }

  checkNonArweaveSigningAvailability(bundling: boolean): void {
    if (this.type !== 'arweave' && !bundling) {
      throw new Error(`Unable to use signing function of type: ${this.type} when bundling is disabled.`);
    }
  }

  private assignDefaultSigner(walletOrSignature) {
    this.signer = async (tx: Transaction) => {
      await this.warp.arweave.transactions.sign(tx, walletOrSignature);
    };
    this.type = 'arweave';
  }

  private assertEnvForCustomSigner(walletOrSignature: CustomSignature) {
    if (
      walletOrSignature.type !== 'arweave' &&
      (!(this.warp.environment == 'mainnet') || !(this.warp.interactionsLoader.type() == 'warp'))
    ) {
      throw new Error(
        `Unable to use signing function of type: ${walletOrSignature.type} when not in mainnet environment or bundling is disabled.`
      );
    }
  }

  private isCustomSignature(signature: ArWallet | CustomSignature): signature is CustomSignature {
    return (signature as CustomSignature).signer !== undefined;
  }
}
