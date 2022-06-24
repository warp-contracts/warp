'use strict';
let ivm = require('isolated-vm');
let fs = require('fs');

let isolate = new ivm.Isolate;
let context = isolate.createContextSync();
let global = context.global;
let fnPromiseRef;
global.setSync('fnPromise', fnPromiseRef = new ivm.Reference(function() {
  return new Promise(function(resolve, reject) {
    fs.readFile(__filename, 'utf8', function(err, val) {
      err ? reject(err) : resolve(val);
    });
  });
}));
global.setSync('fnSync', new ivm.Reference(function() {
  return 'hello';
}));


(async function() {
  let script = await isolate.compileScript('let value = fnPromise.applySyncPromise(undefined, [], {}); value;');
  let value = await script.run(context);
  console.log(value);

  if (/hello123/.test(value)) {
    console.log('pass')
  }
})().catch(console.error);


// Test dead promise (This causes a memory leak! Don't do this!)
// Disabled test because `timeout` is now paused when the isolate is not active.
/*
global.setSync('deadPromise', new ivm.Reference(function() {
	return new Promise(() => {});
}));
isolate.compileScriptSync('deadPromise.applySyncPromise(undefined, [])').run(context, { timeout: 1 }).catch(() => 0);
*/

