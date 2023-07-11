export async function handle(state, action) {
    if (action.input.function === 'readCounter') {
        return { result: state.counter };
    }
}