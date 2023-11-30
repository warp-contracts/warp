import { getQuickJS, newQuickJSAsyncWASMModule } from "quickjs-emscripten";

// the example smart contract code loaded from Arweave blockchain
const code = `
    function handle(state, action) {
      console.log('handle before timeout');
      const timeoutResult = timeout(100); // no 'await' here, because fuck logic
      console.log('handle after timeout:', timeoutResult);
      
      const someShit = {};
      
      for (i = 0; i < 100000; i++) {
        someShit[""+i] = i*i;
      }
      
      return 1;
    }
`.trim();

async function main() {

  // 1. creating the QJS context
  const QuickJS = await newQuickJSAsyncWASMModule();
  const runtime = QuickJS.newRuntime();
  // "Should be enough for everyone" -- attributed to B. Gates
  // runtime.setMemoryLimit(1024 * 640);
  // Limit stack size
  runtime.setMaxStackSize(1024 * 320);
  let interruptCycles = 0
  runtime.setInterruptHandler((runtime) => { interruptCycles++ });

  const vm = runtime.newContext();

  // 2. registering APIs
  const logHandle = vm.newFunction("log", (...args) => {
    const nativeArgs = args.map(vm.dump)
    console.log("QuickJS:", ...nativeArgs)
  });

  const consoleHandle = vm.newObject();
  vm.setProp(consoleHandle, "log", logHandle);
  vm.setProp(vm.global, "console", consoleHandle);
  consoleHandle.dispose();
  logHandle.dispose();

  const timeoutHandle = vm.newAsyncifiedFunction("timeout", async (msHandle) => {
    const ms = vm.getNumber(msHandle);
    console.log("omg, that's an async shit!");
    await timeout(1000);
    return vm.newString("check your head!");
  })
  timeoutHandle.consume((fn) => vm.setProp(vm.global, "timeout", fn))

  // 4. calling the "handle" function
  const result = await vm.evalCodeAsync(`(() => {
  ${code} 
  return handle();
})()`);

  if (result.error) {
    console.log('Execution failed:', vm.dump(result.error));
    result.error.dispose();
  } else {
    const parsedResult = vm.unwrapResult(result).consume(vm.getNumber);
    console.log("result", parsedResult);
    console.log("Cycles", interruptCycles);
  }

  vm.dispose();
  runtime.dispose();
}

main().finally();

function timeout(delay) {
  return new Promise(function (resolve) {
    setTimeout(resolve, delay);
  });
}