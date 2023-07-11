export async function handle(state, action) {
    if (action.input.function === 'readCounter') {
        return { result: state.counter };
    }
    if (action.input.function === 'doWrite') {
        SmartWeave.contracts.write(action.input.targetId, {
            function: 'add'
        });
    }
}