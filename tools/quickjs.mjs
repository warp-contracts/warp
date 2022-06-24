import { getQuickJS } from 'quickjs-emscripten';

const code = `(
async function handle(state, action) {
      if (action.function === 'add') {
        //logger.info('add function called', state);
        state.counter++;
        return {state}
      } 
      
      if (action.function === 'boom') {
        // logger.info('boom function called');
        boom()
        return {state}
      } 
      
      if (action.function === 'assert') {
        // logger.info('assert function called');
        ContractAssert(false, "ContractAssert fired");
        return {state}
      } 
      
       if (action.function === 'unsafe') {
        logger.info('unsafe function called');
        const tx = await SmartWeave.unsafeClient.transactions.get('_0YqJWg12HsNw35uMjoa_UTMM6F_5dYXozBTwwb8Etg');
        logger.info('tx', tx);
        const tags = tx.get('tags');
        logger.info('tags', tags);
        logger.info('tags', tags[0].get('name', {decode: true, string: true }));
        return {state}
      } 
      
      async function boom() {
        Object.values(null);
      }
    
      throw new Error('Unknown function');
    }
    )
`.trim();

async function main() {
  const QuickJS = await getQuickJS();
  const vm = QuickJS.newContext();

  const contract = vm.evalCode(code);
  //console.log(contract);

  if (contract.error) {
    console.log('Execution failed:', vm.dump(contract.error));
    contract.error.dispose();
  } else {
    //console.log(contract.value);
    vm.callFunction(contract.value, undefined, []);
    //console.log('Success:', vm.dump(contract.value));
  }

  //vm.evalCode()



  /*const result = vm.evalCode(`"Hello " + NAME + "!"`);
  if (result.error) {
    console.log('Execution failed:', vm.dump(result.error));
    result.error.dispose();
  } else {
    console.log('Success:', vm.dump(result.value));
    result.value.dispose();
  }*/

  vm.dispose();
}

main().finally();
