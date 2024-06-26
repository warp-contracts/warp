export async function handle(state, action) {
  const balances = state.balances;
  const input = action.input;

  if (input.function === "increase") {
    const target = input.target;
    const qty = input.qty;

    balances[target] += qty;

    return { state };
  }

  if (input.function === "balance") {
    const target = input.target;
    const ticker = state.ticker;

    return { result: { target, ticker, balance: balances[target] } };
  }

  throw new ContractError(`No function supplied or function not recognised: "${input.function}"`);
}
