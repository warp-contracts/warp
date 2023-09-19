import { ContractDefinition } from '../../../ContractDefinition';
import { WarpEnvironment } from '../../../Warp';

export class InvalidEnvError extends Error {}

export class EnvVerifier {
  private readonly env: WarpEnvironment;

  constructor(env: WarpEnvironment) {
    this.env = env;
  }

  public verify(def: ContractDefinition<unknown>): void {
    if (def.testnet && this.env !== 'testnet') {
      throw new InvalidEnvError(
        'Trying to use testnet contract in a non-testnet env. Use the "forTestnet" factory method.'
      );
    }
    if (!def.testnet && this.env === 'testnet') {
      throw new InvalidEnvError('Trying to use non-testnet contract in a testnet env.');
    }
  }
}
