export function handle(state, action) {
  if (state.counter === undefined) {
    state.counter = 0;
  }
  if (action.input.function === "add") {
    state.counter++;
    return {state};
  }
  if (action.input.function === "value") {
    return {result: state.counter}
  }
  if (action.input.function === "blockHeight") {
    return {result: SmartWeave.block.height};
  }
  if (action.input.function === "readContract2") {
    const id = action.input.contractId;
    const value = SmartWeave.contracts.readContractState(id);
    return {result: value};
  }
}
