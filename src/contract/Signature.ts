import Transaction from 'arweave/node/lib/transaction';
import { Warp } from 'core/Warp';
import { ArWallet } from './deploy/CreateContract';

export type SigningFunction = (tx: Transaction) => Promise<void>;
export type SignatureType = { signer: SigningFunction; type: 'arweave' | 'ethereum' };

export class Signature {
  readonly signer: SigningFunction;
  readonly type: 'arweave' | 'ethereum';
  readonly warp: Warp;

  constructor(warp: Warp, walletOrSignature: ArWallet | SignatureType) {
    this.warp = warp;

    if (this.isSignatureType(walletOrSignature)) {
      if (
        walletOrSignature.type !== 'arweave' &&
        (!(this.warp.environment == 'mainnet') || !(this.warp.interactionsLoader.type() == 'warp'))
      ) {
        throw new Error(
          `Unable to use signing function of type: ${walletOrSignature.type} when not in mainnet environment or bundling is disabled.`
        );
      } else {
        this.signer = walletOrSignature.signer;
        this.type = walletOrSignature.type;
      }
    } else {
      this.signer = async (tx: Transaction) => {
        await this.warp.arweave.transactions.sign(tx, walletOrSignature);
      };
      this.type = 'arweave';
    }
  }

  checkNonArweaveSigningAvailability(bundling: boolean): void {
    if (this.type !== 'arweave' && !bundling) {
      throw new Error(`Unable to use signing function of type: ${this.type} when bundling is disabled.`);
    }
  }

  private isSignatureType(signature: ArWallet | SignatureType): signature is SignatureType {
    return (signature as SignatureType).signer !== undefined;
  }
}
