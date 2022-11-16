import Transaction from 'arweave/node/lib/transaction';
import { Warp } from 'core/Warp';
import { Signature, SigningFunction } from './Contract';
import { ArWallet } from './deploy/CreateContract';

export class Wallet {
  public signature: Signature;
  private readonly warp: Warp;

  constructor(warp: Warp) {
    this.warp = warp;
  }

  getSignature(signature: ArWallet | Signature) {
    if (this.isSignatureType(signature)) {
      if (
        signature.signatureType !== 'arweave' &&
        (!(this.warp.environment == 'mainnet') || !(this.warp.interactionsLoader.type() == 'warp'))
      ) {
        throw new Error(
          `Unable to use signing function of type: ${signature.signatureType} when not in mainnet environment or bundling is disabled.`
        );
      } else {
        this.signature = {
          signer: signature.signer,
          signatureType: signature.signatureType
        };
      }
    } else {
      this.signature = {
        signer: async (tx: Transaction) => {
          await this.warp.arweave.transactions.sign(tx, signature);
        },
        signatureType: 'arweave'
      };
    }
  }

  isSignatureType(signature: ArWallet | Signature): signature is Signature {
    return (signature as Signature).signer !== undefined;
  }
}
