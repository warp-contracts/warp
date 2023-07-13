export async function handle(state, action) {
  const balances = state.balances;
  const input = action.input;


  if (input.function === "balance") {
    const target = input.target;
    const ticker = state.ticker;

    return { result: { target, ticker, balance: balances[target] } };
  }

  if (input.function === "readBalanceFrom") {
    let token = input.tokenAddress;
    let tx = input.contractTxId;

    const result = await SmartWeave.contracts.readContractState(token);

    balances[tx] = result.balances[tx];
    return { state };
  }

  throw new ContractError(`No function supplied or function not recognised: "${input.function}"`);
}
