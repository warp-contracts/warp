import { SmartWeaveGlobal } from "../../../../legacy/smartweave-global";
import { LoggerFactory } from "../../../../logging/LoggerFactory";

export const asWasmImports = (swGlobal: SmartWeaveGlobal, wasmInstance: any): any => {
  const wasmLogger = LoggerFactory.INST.create('WASM:AS');

  return {
    metering: {
      usegas: swGlobal.useGas
    },
    console: {
      'console.log': function (msgPtr) {
        wasmLogger.debug(`${swGlobal.contract.id}: ${wasmInstance.exports.__getString(msgPtr)}`);
      },
      'console.logO': function (msgPtr, objPtr) {
        wasmLogger.debug(
          `${swGlobal.contract.id}: ${wasmInstance.exports.__getString(msgPtr)}`,
          JSON.parse(wasmInstance.exports.__getString(objPtr))
        );
      }
    },
    block: {
      'Block.height': function () {
        return swGlobal.block.height;
      },
      'Block.indep_hash': function () {
        return wasmInstance.exports.__newString(swGlobal.block.indep_hash);
      },
      'Block.timestamp': function () {
        return swGlobal.block.timestamp;
      }
    },
    transaction: {
      'Transaction.id': function () {
        return wasmInstance.exports.__newString(swGlobal.transaction.id);
      },
      'Transaction.owner': function () {
        return wasmInstance.exports.__newString(swGlobal.transaction.owner);
      },
      'Transaction.target': function () {
        return wasmInstance.exports.__newString(swGlobal.transaction.target);
      }
    },
    contract: {
      'Contract.id': function () {
        return wasmInstance.exports.__newString(swGlobal.contract.id);
      },
      'Contract.owner': function () {
        return wasmInstance.exports.__newString(swGlobal.contract.owner);
      }
    },
    api: {
      _readContractState: (fnIndex, contractTxIdPtr) => {
        const contractTxId = wasmInstance.exports.__getString(contractTxIdPtr);
        const callbackFn = getFn(fnIndex);
        console.log('Simulating read state of', contractTxId);
        return setTimeout(() => {
          console.log('calling callback');
          callbackFn(
            wasmInstance.exports.__newString(
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
        const message = wasmInstance.exports.__getString(messagePtr);
        wasmLogger.error('--------------------- Error message from AssemblyScript ----------------------\n');
        wasmLogger.error('  ' + message);
        wasmLogger.error('    In file "' + wasmInstance.exports.__getString(fileNamePtr) + '"');
        wasmLogger.error(`    on line ${line}, column ${column}.`);
        wasmLogger.error('------------------------------------------------------------------------------\n');

        throw new Error(message);
      }
    }
  };

  function getFn(idx) {
    return wasmInstance.exports.table.get(idx);
  }
};
