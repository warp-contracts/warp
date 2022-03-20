import { ContractError, ERC20 } from './ERC20';
import { console } from '../imports/console';
import { msg } from '../imports/smartweave/msg';

export abstract class AbstractERC20 implements ERC20 {
  private _name: string;
  private _symbol: string;
  protected _totalSupply: u64;
  protected readonly _balances: Map<string, u64> = new Map<string, u64>();
  protected readonly _allowances: Map<string, Map<string, u64>> = new Map<string, Map<string, u64>>();

  protected constructor(name_: string, symbol_: string) {
    this._name = name_;
    this._symbol = symbol_;
    this._totalSupply = 0;
  }

  abstract mint(account: string, amount: u64): void;
  abstract burn(account: string, amount: u64): void;

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
    } else {
      let spenderAllowance: u64 = this._allowances.get(msgSender).get(spender);
      spenderAllowance += amount;
      this._allowances.get(msgSender).set(spender, spenderAllowance);
    }
  }

  protected _transfer(sender: string, recipient: string, amount: u64): void {
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

  get totalSupply(): u64 {
    return this._totalSupply;
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

  get name(): string {
    return this._name;
  }

  get symbol(): string {
    return this._symbol;
  }

  set name(value: string) {
    this._name = value;
  }

  set symbol(value: string) {
    this._symbol = value;
  }
}
