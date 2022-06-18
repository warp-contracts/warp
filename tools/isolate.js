// Create a new isolate limited to 128MB
const ivm = require('isolated-vm');
const isolate = new ivm.Isolate({memoryLimit: 128});

const context = isolate.createContextSync();

const jail = context.global;

jail.setSync('global', jail.derefInto());

jail.setSync('log', function (...args) {
  console.log(...args);
});

const initState = {
  counter: 0
};

const ec = new ivm.ExternalCopy(initState);
jail.setSync(
  'state',
  ec.copyInto()
);

const contract = isolate.compileScriptSync(
  `
	async function handle(state, action) {
	  log(action);
    log(state);
	
	  if (action.function === 'add') {
	    state.counter++;
	    return {state}
	  } 
	  
	   if (action.function === 'boom') {
	    boom()
	    return {state}
	  } 
	  
	  async function boom() {
      Object.values(null);
    }
	
	  throw new Error('Unknown function');
  }
  
  handle(state, action);
  
`
);

jail.setSync(
  'action',
  new ivm.ExternalCopy({
    function: 'add'
  }).copyInto()
);

contract.runSync(context);
console.log("result 1", jail.getSync('state').copySync());

contract.runSync(context);
console.log("result 2", jail.getSync('state').copySync());

contract.runSync(context);
console.log("result 3", jail.getSync('state').copySync());

jail.setSync(
  'action',
  new ivm.ExternalCopy({
    function: 'subtract'
  }).copyInto()
);
try {
  contract.runSync(context);
} catch (e) {
  console.error(e);
}
console.log("result 4", jail.getSync('state').copySync());

jail.setSync(
  'action',
  new ivm.ExternalCopy({
    function: 'boom'
  }).copyInto()
);
try {
  contract.runSync(context);
} catch (e) {
  console.error(e);
}
console.log("final result", jail.getSync('state').copySync());
console.log("initState", initState);
isolate.dispose();

/*contract.run(context).then((r) => {
  console.log(r);
});*/

/*jail.setSync(
  'action',
  new ivm.ExternalCopy({
    function: 'subtract'
  }).copyInto()
);

contract.run(context).then((r) => {
  console.log(r);
});*/

/*const result = context.evalClosureSync(
  `
  async function handle(action, state) {
    state.test = action.function
    
    return {state}
  }
`,
  [new ivm.Reference({
    function: 'isolate'
  }), new ivm.Reference({
    foo: 'bar'
  })]
);*/

//console.log(jail.getSync('state'));

// Using the async version of `run` so that calls to `log` will get to the main node isolate
//hostile.run(context).catch((err) => console.error('gotcha', err));
// I've wasted 2MB
// I've wasted 4MB
// ...
// I've wasted 130MB
// I've wasted 132MB
// RangeError: Array buffer allocation failed
