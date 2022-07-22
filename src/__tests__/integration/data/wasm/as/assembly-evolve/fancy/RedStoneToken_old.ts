import {ContractError, ERC20} from './ERC20';
import {console} from '../imports/console';
import {Block} from '../imports/smartweave/block';
import {Transaction} from '../imports/smartweave/transaction';
import {Contract} from '../imports/smartweave/contract';
import {msg} from '../imports/smartweave/msg';
import {setTimeout} from '../imports/api';

export class RedStoneToken_old implements ERC20 {
  private readonly _name: string;

  private readonly _symbol: string;

  private _totalSupply: u64;

  private readonly _balances: Map<string, u64> = new Map<string, u64>();

  private readonly _allowances: Map<string, Map<string, u64>> = new Map<string, Map<string, u64>>();

  // just for tests.
  private _structField: ProviderData = new ProviderData(
    'RedStone Provider',
    'RedStone Provider desc',
    'RedStone Provider manifest'
  );

  private _arrayField: Uint16Array = new Uint16Array(10);

  constructor(name_: string, symbol_: string) {
    this._name = name_;
    this._symbol = symbol_;
    this._totalSupply = 0;

    /**
     * WASM testing BEGIN
     */
    console.log(`Constructor: ${this._structField.toString()}`);
    console.log(`Block#height: ${Block.height()}`);
    console.log(`Block#indep_hash: ${Block.indep_hash()}`);
    console.log(`Block#timestamp: ${Block.timestamp()}`);

    console.log(`Transaction#id: ${Transaction.id()}`);
    console.log(`Transaction#owner: ${Transaction.owner()}`);
    console.log(`Transaction#target: ${Transaction.target()}`);

    console.log(`Contract#id: ${Contract.id()}`);
    console.log(`Contract#owner: ${Contract.owner()}`);

    console.log(`msg#sender: ${msg.sender()}`);
    /**
     * WASM testing END
     */
  }

  get totalSupply(): u64 {
    return this._totalSupply;
  }

  balanceOf(account: string): u64 {
    console.log(`balanceOf called ${account}`);
    if (this._balances.has(account)) {
      return this._balances.get(account);
    } else {
      return 0;
    }
  }

  allowance(owner: string, spender: string): u64 {
    console.log(`allowance called ${owner}: ${spender}`);
    let result: u64 = 0;
    if (this._allowances.has(owner) && this._allowances.get(owner).has(spender)) {
      const ownerAllowances: Map<string, u64> = this._allowances.get(owner);
      result = ownerAllowances.get(spender);
    }

    return result;
  }

  transfer(recipient: string, amount: u64): void {
    console.log(`transfer called ${recipient}: ${amount}`);
    this._transfer(msg.sender(), recipient, amount);
  }

  approve(spender: string, amount: u64): void {
    const msgSender = msg.sender();
    if (!this._allowances.has(msgSender)) {
      this._allowances.set(msgSender, new Map<string, u64>());
    }
    if (!this._allowances.get(msgSender).has(spender)) {
      this._allowances.get(msgSender).set(spender, amount);
    }
  }

  transferFrom(sender: string, recipient: string, amount: u64): void {
    const msgSender = msg.sender();
    console.log(`transferFrom called ${sender}[${msgSender}] -> ${recipient}:${amount}`);

    if (!this._allowances.has(sender) || !this._allowances.get(sender).has(msgSender)) {
      throw new ContractError(`No allowance for ${msgSender} from ${sender}`);
    }

    let currentAllowance = this._allowances.get(sender).get(msgSender);
    if (currentAllowance < amount) {
      throw new ContractError(`Transfer amount exceeds allowance`);
    }
    currentAllowance -= amount;
    this._allowances.get(sender).set(msgSender, currentAllowance);
    this._transfer(sender, recipient, amount);
  }

  // TODO: ownership
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

  // TODO: ownership
  burn(account: string, amount: u64): void {
    console.log(`burn called ${account}: ${amount}`);
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

  get name(): string {
    return this._name;
  }

  get symbol(): string {
    return this._symbol;
  }

  private _transfer(sender: string, recipient: string, amount: u64): void {
    if (amount <= 0 || sender === recipient) {
      throw new ContractError('Invalid token transfer');
    }

    let senderBalance = this._balances.get(sender);
    if (senderBalance < amount) {
      throw new ContractError(`Caller balance not high enough to send ${amount} token(s)!`);
    }
    senderBalance -= amount;
    this._balances.set(sender, senderBalance);

    if (!this._balances.has(recipient)) {
      this._balances.set(recipient, amount);
    } else {
      let recipientBalance = this._balances.get(sender);
      recipientBalance += amount;
      this._balances.set(recipient, recipientBalance);
    }
  }

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

/**
 * WASM testing BEGIN
 */
export function getToken(): RedStoneToken_old {
  return new RedStoneToken_old('RedStone', 'RDST');
}

export const UINT16ARRAY_ID = idof<Uint16Array>();
export const ProviderData_ID = idof<string[]>();

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
