export async function handle(state, action) {
  if (state.counter === undefined) {
    state.counter = 0;
  }
  if (action.input.function === 'add') {
    state.counter++;
    return { state };
  }

  if (action.input.function === 'add-and-write') {
    console.log('add and write');
    const result = await SmartWeave.contracts.write(action.input.contractId, {
      function: 'add-amount',
      amount: action.input.amount
    });

    console.log('result from caller:', result);

    state.counter += result.state.counter;

    return { state };
  }

  if (action.input.function === 'add-amount') {
    state.counter += action.input.amount;

    return { state };
  }
  if (action.input.function === 'add-amount-depth') {
    state.counter += action.input.amount;
    await SmartWeave.contracts.write(action.input.contractId, {
      function: 'add-amount',
      amount: action.input.amount + 20
    });
    return { state };
  }

  if (action.input.function === 'value') {
    return { result: state.counter };
  }
  if (action.input.function === 'blockHeight') {
    return { result: SmartWeave.block.height };
  }
  if (action.input.function === 'readContract2') {
    const id = action.input.contractId;
    const value = SmartWeave.contracts.readContractState(id);
    return { result: value };
  }
}
