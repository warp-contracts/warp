import { Warp } from '../core/Warp';
import { ArWallet } from './deploy/CreateContract';
import { Transaction } from '../utils/types/arweave-types';
import { BundlerSigner } from './deploy/DataItem';

export type SignatureType = 'arweave' | 'ethereum';
export type SigningFunction = (tx: Transaction) => Promise<void>;
export type CustomSignature = {
  signer: SigningFunction;
  type: SignatureType;
  getAddress?: () => Promise<string>;
};

/**
Different types which can be used to sign transaction or data item
- ArWallet - default option for signing Arweave transactions, either JWKInterface or 'use_wallet'
- CustomSignature - object with `signer` field - a custom signing function which takes transaction as a parameter and requires signing it 
  on the client side and `type` field of type SignatureType which indicates the wallet's chain, either 'arweave' or 'ethereum'
- Signer - arbundles specific class which allows to sign data items (only this type can be used when bundling is enabled and data items 
  are being created)
*/
export type SignatureProvider = ArWallet | CustomSignature | BundlerSigner;

export class Signature {
  signer: SigningFunction;
  readonly type: SignatureType;
  readonly warp: Warp;
  private readonly signatureProviderType: 'CustomSignature' | 'ArWallet' | 'BundlerSigner';
  private readonly wallet;
  private cachedAddress?: string;

  constructor(warp: Warp, walletOrSignature: SignatureProvider) {
    this.warp = warp;

    if (this.isCustomSignature(walletOrSignature)) {
      this.assertEnvForCustomSigner(walletOrSignature.type);
      this.signer = walletOrSignature.signer;
      this.type = walletOrSignature.type;
      this.signatureProviderType = 'CustomSignature';
    } else if (this.isValidBundlerSignature(walletOrSignature)) {
      this.signatureProviderType = 'BundlerSigner';
      this.type = decodeBundleSignatureType(walletOrSignature.signatureType);
    } else {
      this.assignArweaveSigner(walletOrSignature);
      this.signatureProviderType = 'ArWallet';
      this.type = 'arweave';
    }
    this.wallet = walletOrSignature;
  }

  async getAddress(): Promise<string> {
    if (this.cachedAddress) {
      return this.cachedAddress;
    }

    switch (this.signatureProviderType) {
      case 'CustomSignature': {
        if (this.wallet.getAddress) {
          this.cachedAddress = await this.wallet.getAddress();
        } else {
          this.cachedAddress = await this.deduceSignerBySigning();
        }
        return this.cachedAddress;
      }
      case 'ArWallet': {
        this.cachedAddress = await this.deduceSignerBySigning();
        return this.cachedAddress;
      }
      case 'BundlerSigner': {
        // If we can parse publicKey to `signatureType` address, we don't have to call it
        this.cachedAddress = await this.deduceSignerBySigning();
        return this.cachedAddress;
      }
      default:
        throw Error('Unknown Signature::signatureProvider : ' + this.signatureProviderType);
    }
  }

  private async deduceSignerBySigning() {
    const { arweave } = this.warp;

    const dummyTx = await arweave.createTransaction({
      data: Math.random().toString().slice(-4),
      reward: '72600854',
      last_tx: 'p7vc1iSP6bvH_fCeUFa9LqoV5qiyW-jdEKouAT0XMoSwrNraB9mgpi29Q10waEpO'
    });
    await this.signer(dummyTx);

    if (this.type === 'ethereum') {
      return dummyTx.owner;
    } else if (this.type === 'arweave') {
      return arweave.wallets.ownerToAddress(dummyTx.owner);
    } else {
      throw Error('Unknown Signature::type');
    }
  }

  checkNonArweaveSigningAvailability(bundling: boolean): void {
    if (this.type !== 'arweave' && !bundling) {
      throw new Error(`Unable to use signing function of type: ${this.type} when bundling is disabled.`);
    }
  }

  private assignArweaveSigner(walletOrSignature) {
    this.signer = async (tx: Transaction) => {
      await this.warp.arweave.transactions.sign(tx, walletOrSignature);
    };
  }

  private assertEnvForCustomSigner(signatureType: SignatureType) {
    if (
      signatureType !== 'arweave' &&
      (!(this.warp.environment == 'mainnet') || !(this.warp.interactionsLoader.type() == 'warp'))
    ) {
      throw new Error(
        `Unable to use signing function of type: ${signatureType} when not in mainnet environment or bundling is disabled.`
      );
    }
  }

  private isCustomSignature(signature: SignatureProvider): signature is CustomSignature {
    return (signature as CustomSignature).signer !== undefined;
  }

  private isValidBundlerSignature(signature: SignatureProvider): signature is BundlerSigner {
    const bundlerSignature = signature as BundlerSigner;

    // "If it looks like a duck, swims like a duck, and quacks like a duck, then it probably is a duck"
    const isBundlerSignature =
      !!bundlerSignature.signatureType && !!bundlerSignature.ownerLength && !!bundlerSignature.signatureLength;

    if (isBundlerSignature && !bundlerSignature.publicKey) {
      throw new Error(
        `It seems that you are using BundlerSigner, but publicKey is not set! Maybe try calling await bundlerSigner.setPublicKey() before using it.`
      );
    }

    return isBundlerSignature;
  }
}

function decodeBundleSignatureType(bundlerSignatureType: BundlerSigner['signatureType']): SignatureType {
  // enum: https://github.com/Bundlr-Network/arbundles/blob/9fafdbfec6fbfcbcb538b92ae9bd0d9fbe413fb8/src/constants.ts#L1
  if (bundlerSignatureType === 3) {
    return 'ethereum';
  } else if (bundlerSignatureType === 1) {
    return 'arweave';
  } else {
    throw Error(`Not supported arbundle SignatureType : ${bundlerSignatureType}`);
  }
}
