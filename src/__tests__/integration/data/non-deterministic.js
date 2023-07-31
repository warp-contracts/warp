export async function handle(state, action) {
  const input = action.input;

  if (input.function === 'mathRandom') {
    const number = Math.random();
    state.number = number;
    return { state };
  }

  if (input.function === 'mathMax') {
    const number = Math.max(1, 2, 3);
    state['mathMax'] = number;
    return { state };
  }

  if (input.function === 'dateNow') {
    const date = Date.now();
    state['dateNow'] = date;
    return { state };
  }

  if (input.function === 'date') {
    const date = new Date();
    state['date'] = date;
    return { state };
  }

  if (input.function === 'specificDate') {
    const date = new Date('2001-08-20');
    state['specificDate'] = date;
    return { state };
  }

  if (input.function === 'setTimeout') {
    setTimeout(() => {
      state['test'] = 1;
      console.log("Delayed for 1 second.");
    }, 1000);

    return state;
  }

  if (input.function === 'setInterval') {
    setInterval(() => {
      state['test'] = 1;
      console.log("Interval.");
    }, 1000);

    return state;
  }

  if (input.function === 'weakMap') {
    const wm = new WeakMap([
      [{name: 'John'}, 'John Doe'],
      [{name: 'Jane'}, 'Jane Doe'],
    ]);
    state['weakMap'] = wm;

    return { state };
  }

  if (input.function === 'weakRef') {
    const wr = new WeakRef({name: 'John Doe'});
    state['weakRef'] = wr;

    return { state };
  }

  throw new ContractError(`No function supplied or function not recognised: "${input.function}"`);
}
