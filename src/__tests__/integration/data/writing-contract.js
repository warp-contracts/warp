export async function handle(state, action) {
  if (action.input.function === 'writeContract') {
    const value = await SmartWeave.contracts.write(action.input.contractId, {
      function: 'add-amount',
      amount: action.input.amount
    });
    logger.debug('Internal write result', value);
    return { state };
  }

  if (action.input.function === 'writeInDepth') {
    const value1 = await SmartWeave.contracts.write(action.input.contractId1, {
      function: 'add-amount-depth',
      amount: action.input.amount,
      contractId: action.input.contractId2
    });

    logger.debug('Internal write result', { value1: value1.state });
    return { state };
  }

  if (action.input.function === 'writeMultiContract') {
    const value1 = await SmartWeave.contracts.write(action.input.contractId1, {
      function: 'add-amount',
      amount: action.input.amount
    });

    const value2 = await SmartWeave.contracts.write(action.input.contractId2, {
      function: 'add-amount',
      amount: action.input.amount
    });
    logger.debug('Internal write result', { value1: value1.state, value2: value2.state });
    return { state };
  }

  if (action.input.function === 'writeContractCheck') {
    const calleeState = await SmartWeave.contracts.readContractState(action.input.contractId);
    if (calleeState.counter > 600) {
      const result = await SmartWeave.contracts.write(action.input.contractId, {
        function: 'add-amount',
        amount: -action.input.amount
      });
      state.counter += result.state.counter;
    } else {
      const result = await SmartWeave.contracts.write(action.input.contractId, {
        function: 'add-amount',
        amount: action.input.amount
      });
      state.counter += result.state.counter;
      console.log(result.state.counter);
    }

    logger.debug('Internal write result');
    return { state };
  }

  if (action.input.function === 'writeBack') {
    console.log('write-back', SmartWeave.contract.id);
    const result = await SmartWeave.contracts.write(action.input.contractId, {
      function: 'add-and-write',
      amount: action.input.amount,
      contractId: SmartWeave.contract.id
    });

    console.log('result from callee:', result);

    state.counter += result.state.counter;

    return { state };
  }

  if (action.input.function === 'writeBackCheck') {
    console.log('write-back', SmartWeave.contract.id);
    const result = await SmartWeave.contracts.write(action.input.contractId, {
      function: 'add-and-write',
      amount: action.input.amount,
      contractId: SmartWeave.contract.id
    });

    console.log('Writing contract before check:', state.counter);
    // Since contractB changes state of this contract (in add-and-write function)
    // we need to refresh the state here manually.
    state = await SmartWeave.contracts.refreshState();
    console.log('Writing contract before check, after refresh:', state.counter);

    if (result.state.counter > 2059) {
      state.counter -= result.state.counter;
    } else {
      state.counter += result.state.counter;
    }

    console.log('result from callee:', result);

    return { state };
  }

  if (action.input.function === 'add-amount') {
    state.counter += action.input.amount;
    console.log('Writing contract add-amount:', state.counter);
    return { state };
  }
}
