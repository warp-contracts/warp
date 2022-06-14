export interface ERC20 {
  // view functions
  totalSupply: u64;
  balanceOf(account: string): u64;
  allowance(owner: string, spender: string): u64;

  // state changing functions
  transfer(recipient: string, amount: u64): void;
  approve(spender: string, amount: u64): void;
  transferFrom(sender: string, recipient: string, amount: u64): void;
}

// no custom exceptions support - throwing Exception
// effectively calls "abort"
export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractError';
  }
}
