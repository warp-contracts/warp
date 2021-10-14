export function handle(state, action) {

  if (action.input.function === 'writeContract') {
    const id = action.input.contractId;
    const value = SmartWeave.contracts.write(id, {
      function: "add-amount",
      amount: action.input.amount
    });
    return { state };
  }
}
