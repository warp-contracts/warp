import { LoggerFactory, SmartWeaveGlobal } from '@smartweave';

export const imports = (swGlobal: SmartWeaveGlobal, wasmModule: any): any => {
  const wasmLogger = LoggerFactory.INST.create('WASM');

  return {
    metering: {
      usegas: swGlobal.useGas
    },
    console: {
      'console.log': function (msgPtr) {
        wasmLogger.debug(`${swGlobal.contract.id}: ${wasmModule.exports.__getString(msgPtr)}`);
      },
      'console.logO': function (msgPtr, objPtr) {
        wasmLogger.debug(
          `${swGlobal.contract.id}: ${wasmModule.exports.__getString(msgPtr)}`,
          JSON.parse(wasmModule.exports.__getString(objPtr))
        );
      }
    },
    block: {
      'Block.height': function () {
        return swGlobal.block.height;
      },
      'Block.indep_hash': function () {
        return wasmModule.exports.__newString(swGlobal.block.indep_hash);
      },
      'Block.timestamp': function () {
        return swGlobal.block.timestamp;
      }
    },
    transaction: {
      'Transaction.id': function () {
        return wasmModule.exports.__newString(swGlobal.transaction.id);
      },
      'Transaction.owner': function () {
        return wasmModule.exports.__newString(swGlobal.transaction.owner);
      },
      'Transaction.target': function () {
        return wasmModule.exports.__newString(swGlobal.transaction.target);
      }
    },
    contract: {
      'Contract.id': function () {
        return wasmModule.exports.__newString(swGlobal.contract.id);
      },
      'Contract.owner': function () {
        return wasmModule.exports.__newString(swGlobal.contract.owner);
      }
    },
    api: {
      _readContractState: (fnIndex, contractTxIdPtr) => {
        const contractTxId = wasmModule.exports.__getString(contractTxIdPtr);
        const callbackFn = getFn(fnIndex);
        console.log('Simulating read state of', contractTxId);
        return setTimeout(() => {
          console.log('calling callback');
          callbackFn(
            wasmModule.exports.__newString(
              JSON.stringify({
                contractTxId
              })
            )
          );
        }, 1000);
      },
      clearTimeout
    },
    env: {
      abort(messagePtr, fileNamePtr, line, column) {
        console.error('--------------------- Error message from AssemblyScript ----------------------');
        console.error('  ' + wasmModule.exports.__getString(messagePtr));
        console.error('    In file "' + wasmModule.exports.__getString(fileNamePtr) + '"');
        console.error(`    on line ${line}, column ${column}.`);
        console.error('------------------------------------------------------------------------------\n');
      }
    }
  };

  function getFn(idx) {
    return wasmModule.exports.table.get(idx);
  }
};
