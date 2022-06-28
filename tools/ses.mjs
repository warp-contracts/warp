import 'ses';

lockdown();

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const c = new Compartment({
  print: harden(console.log),
});

const h = c.globalThis.Function(
  'state', 'action', `return ((state, action) =>
    async function handle(state, action) {
      async function boom() {
        Object.values(null);
      }
      
      if (action.function === 'add') {
        print('add function called', state);
        state.counter++;
        return {state}
      } 
      
      if (action.function === 'boom') {
        print('boom function called');
        boom();
        return {state}
      } 
      
    })(state, action);`.trim());

console.log(h.toString());

let state = {counter: 0};

(async () => {
  try {
    state = (await (h()(state, {function: "add"}))).state;
    console.log("Result", state);
    state = (await (h()(state, {function: "add"}))).state;
    console.log("Result", state);
    state = (await (h()(state, {function: "add"}))).state;
    console.log("Result", state);

    state = (await (h()(state, {function: "boom"}))).state;
    console.log("Result", state);
  } catch (e) {
    console.error('Gotcha!', e);
  }
  await sleep(500);
  console.log('still alive!');
  state = (await (h()(state, {function: "add"}))).state;
  console.log("Result", state);
})();
