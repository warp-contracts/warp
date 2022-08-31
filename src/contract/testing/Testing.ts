import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';

export type Wallet = {
  jwk: JWKInterface;
  address: string;
};

export class Testing {
  constructor(private readonly arweave: Arweave) {}

  async mineBlock(): Promise<void> {
    this.validateEnv();
    await this.arweave.api.get('mine');
  }

  async generateWallet(): Promise<Wallet> {
    this.validateEnv();
    const wallet = await this.arweave.wallets.generate();
    await this.addFunds(wallet);

    return {
      jwk: wallet,
      address: await this.arweave.wallets.jwkToAddress(wallet)
    };
  }

  private async addFunds(wallet: JWKInterface) {
    const walletAddress = await this.arweave.wallets.getAddress(wallet);
    await this.arweave.api.get(`/mint/${walletAddress}/1000000000000000`);
  }

  private validateEnv(): void {
    if (this.arweave.api.getConfig().host.includes('arweave')) {
      throw new Error('Testing features are not available in a non testing environment');
    }
  }
}
