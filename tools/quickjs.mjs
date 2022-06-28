import {getQuickJS, newQuickJSAsyncWASMModule} from 'quickjs-emscripten';

// the example smart contract code
const code = `
(() => {
    async function handle(state, action) {
      console.log('handle');
      return 1;
    }
    return handle;
})();
`.trim();

async function main() {

  // 1. creating the QJS context
  const QuickJS = await getQuickJS();
  const vm = QuickJS.newContext();

  const fnHandle = vm.newFunction("executePendingJobs", () => {
    console.log('executePendingJobs');
    vm.runtime.executePendingJobs();
  });
  vm.setProp(vm.global, "executePendingJobs", fnHandle)
  fnHandle.dispose()

  // 2. registering "console.log" API
  const logHandle = vm.newFunction("log", (...args) => {
    const nativeArgs = args.map(vm.dump)
    console.log("QuickJS:", ...nativeArgs)
  });
  const consoleHandle = vm.newObject();
  vm.setProp(consoleHandle, "log", logHandle);
  vm.setProp(vm.global, "console", consoleHandle);
  consoleHandle.dispose();
  logHandle.dispose();

  // 3. registering the "handle" function in a global scope
  const handle = vm.evalCode(code);
  vm.setProp(vm.global, 'handle', handle.value);

  // 4. calling the "handle" function
  const result = await vm.evalCode(`(async () => {
       const result = await handle();
       console.log('result', result);
       //executePendingJobs();
       return result;
     })()`);

  // execute pending jobs - is it necessary here?
  //vm.runtime.executePendingJobs();

  if (result.error) {
    console.log('Execution failed:', vm.dump(result.error));
    result.error.dispose();
  } else {
    const promiseHandle = vm.unwrapResult(result)
    console.log("Result1");
    const resolvedResult = await vm.resolvePromise(promiseHandle)
    promiseHandle.dispose();
    const resolvedHandle = vm.unwrapResult(resolvedResult);
    console.log("Result2:", vm.getNumber(resolvedHandle));
  }

  vm.dispose();
}

main().finally();
