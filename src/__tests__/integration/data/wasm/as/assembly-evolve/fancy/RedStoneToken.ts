import {AbstractERC20} from './AbstractERC20';
import {console} from '../imports/console';
import {ContractError} from './ERC20';
import {setTimeout} from '../imports/api';
import {msg} from '../imports/smartweave/msg';

export class RedStoneToken extends AbstractERC20 {
  constructor(name_: string, symbol_: string) {
    super(name_, symbol_);
  }

  burn(account: string, amount: u64): void {
    console.log(`burn called ${account}: ${amount}`);
    const msgSender = msg.sender();
    if (account != msgSender) {
      throw new ContractError('Only account owner can burn his tokens');
    }
    if (!this._balances.has(account)) {
      throw new ContractError('Account has no balance');
    }

    if (this._balances.get(account) < amount) {
      throw new ContractError('Account has not enough balance');
    }

    const currentBalance = this._balances.get(account);
    this._balances.set(account, currentBalance - amount);
    this._totalSupply -= amount;
  }

  mint(account: string, amount: u64): void {
    console.log(`mint called ${account}: ${amount}`);

    if (this._balances.has(account)) {
      const currentBalance = this._balances.get(account);
      this._balances.set(account, currentBalance + amount);
    } else {
      this._balances.set(account, amount);
    }
    this._totalSupply += amount;
  }

  // just for tests.
  private _structField: ProviderData = new ProviderData(
    'RedStone Provider',
    'RedStone Provider desc',
    'RedStone Provider manifest'
  );

  private _arrayField: Uint16Array = new Uint16Array(10);

  /**
   * WASM testing BEGIN
   */
  testTimeout(milliseconds: f32): void {
    let timeout: i32 = 0;

    timeout = setTimeout<ProviderData>((providerData: ProviderData) => {
      console.log('After timeout: ' + providerData.name);
      // no closures support
      // clearTimeout(timeout);
    }, milliseconds);
  }

  get structField(): ProviderData {
    return this._structField;
  }

  get arrayField(): Uint16Array {
    return this._arrayField;
  }

  set arrayField(value: Uint16Array) {
    console.log(`arrayField called ${value}`);
    this._arrayField = value;
  }

  modifyProviderDataArray(data: ProviderData[]): ProviderData[] {
    console.log('modifyProviderDataArray');
    return data.map<ProviderData>((pd) => {
      pd.name += ' WASM';
      return pd;
    });
  }

  /**
   * WASM testing END
   */
}

export const UINT16ARRAY_ID = idof<Uint16Array>();
export const ProviderData_ID = idof<string[]>();
/**
 * WASM testing BEGIN
 */
export function getToken(): RedStoneToken {
  return new RedStoneToken('RedStone', 'RDST');
}

/**
 * Some test class to verify wasm-js interoperability
 */
export class ProviderData {
  name: string;
  description: string;
  manifestTxId: string;

  constructor(name: string, description: string, manifestTxId: string) {
    this.name = name;
    this.description = description;
    this.manifestTxId = manifestTxId;
  }

  toString(): string {
    return `
    ProviderData
      #name: ${this.name}
      #description: ${this.description}
      #manifestTxId: ${this.manifestTxId}
    `;
  }
}
/**
 * WASM testing END
 */
