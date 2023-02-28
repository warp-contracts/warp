export async function handle(state, action) {

    if (action.input.function == '__init') {
        state.counter = 100;
        return { state };
    }

    if (action.input.function == 'write') {
        state.counter = (state.counter || 0) + 1;
        return { state }
    } else if (action.input.function == 'read') {
        return { result: state.counter || 0 }
    }
}