import {SmartWeaveGlobal} from "@smartweave";

export function imports(swGlobal: SmartWeaveGlobal, wasmExports: any): any {
  return {
    metering: {
      usegas: (gas) => {
        if (gas < 0) {
          return;
        }
        swGlobal.gasUsed += gas;
        if (swGlobal.gasUsed > swGlobal.gasLimit) {
          throw new Error(`[RE:OOG] Out of gas! Limit: ${formatGas(swGlobal.gasUsed)}, used: ${formatGas(swGlobal.gasLimit)}`);
        }
      }
    },
    console: {
      "console.log": function (msgPtr) {
        console.log(`Contract: ${wasmExports.__getString(msgPtr)}`);
      },
      "console.logO": function (msgPtr, objPtr) {
        console.log(`Contract: ${wasmExports.__getString(msgPtr)}`, JSON.parse(wasmExports.__getString(objPtr)));
      },
    },
    block: {
      "Block.height": function () {
        return 875290;
      },
      "Block.indep_hash": function () {
        return wasmExports.__newString("iIMsQJ1819NtkEUEMBRl6-7I6xkeDipn1tK4w_cDFczRuD91oAZx5qlgSDcqq1J1");
      },
      "Block.timestamp": function () {
        return 123123123;
      },
    },
    transaction: {
      "Transaction.id": function () {
        return wasmExports.__newString("Transaction.id");
      },
      "Transaction.owner": function () {
        return wasmExports.__newString("Transaction.owner");
      },
      "Transaction.target": function () {
        return wasmExports.__newString("Transaction.target");
      },
    },
    contract: {
      "Contract.id": function () {
        return wasmExports.__newString("Contract.id");
      },
      "Contract.owner": function () {
        return wasmExports.__newString("Contract.owner");
      },
    },
    msg: {
      "msg.sender": function () {
        return wasmExports.__newString("msg.sender");
      },
    },
    api: {
      _readContractState: (fnIndex, contractTxIdPtr) => {
        const contractTxId = wasmExports.__getString(contractTxIdPtr);
        const callbackFn = getFn(fnIndex);
        console.log("Simulating read state of", contractTxId);
        return setTimeout(() => {
          console.log('calling callback');
          callbackFn(wasmExports.__newString(JSON.stringify({
            contractTxId
          })));
        }, 1000);
      },
      clearTimeout,
    },
    env: {
      abort(messagePtr, fileNamePtr, line, column) {
        console.error("--------------------- Error message from AssemblyScript ----------------------");
        console.error("  " + wasmExports.__getString(messagePtr));
        console.error(
          '    In file "' + wasmExports.__getString(fileNamePtr) + '"'
        );
        console.error(`    on line ${line}, column ${column}.`);
        console.error("------------------------------------------------------------------------------\n");
      },
    }
  }

  function getFn(idx) {
    return wasmExports.table.get(idx);
  }
}

function formatGas(gas) {
  return gas * 1e-4;
}
