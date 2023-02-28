export async function handle(state, action) {
    state.calls = state.calls || [];

    state.calls = [...state.calls, action.input.function]

    if (action.input.function == '__init') {
        state.caller = action.caller;
        state.caller2 = SmartWeave.caller;

        await SmartWeave.contracts.write(action.input.args.foreignContract, {});

        if (action.input.args.fail) {
            throw new ContractError("Fail on purpose")
        }
        state.counter = action.input.args.counter + 1;
    }

    return { state }
}