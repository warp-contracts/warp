import Transaction from 'arweave/node/lib/transaction';
import { Warp } from '../core/Warp';
import { ArWallet } from './deploy/CreateContract';

export type SignatureType = 'arweave' | 'ethereum';
export type SigningFunction = (tx: Transaction) => Promise<void>;
export type CustomSignature = { signer: SigningFunction; type: SignatureType };

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
