/* eslint-disable */
const fs = require('fs');

import { defaultCacheOptions, LoggerFactory, WarpFactory } from '../src';

let ownerWallet, owner;

let arlocal;
let warp;
let bar;

let contractTxId, initialState;

LoggerFactory.INST.logLevel('error');
LoggerFactory.INST.logLevel('debug', 'JsHandlerApi');
LoggerFactory.INST.logLevel('debug', 'AbstractContractHandler');

(async function evaluate() {
  warp = WarpFactory.forMainnet({ ...defaultCacheOptions, inMemory: true });

  ({ jwk: ownerWallet, address: owner } = await warp.generateWallet());

  bar = warp
    .contract('VFr3Bk-uM-motpNNkkFg4lNW1BMmSfzqsVO551Ho4hA')
    .setEvaluationOptions({
      maxInteractionEvaluationTimeSeconds: 180,
      internalWrites: true,
      unsafeClient: 'skip',
      allowBigInt: true,
      useVM2: true
    })
    .connect(ownerWallet);

  //   const rawInteractions = await warp.interactionsLoader.load("VFr3Bk-uM-motpNNkkFg4lNW1BMmSfzqsVO551Ho4hA");
  //   var interactions = rawInteractions.reduce(function(map, obj) {
  //     map[obj.id] = obj;
  //     return map;
  //   }, {});
  //console.log(interactions);

  const failingContracts = {};
  try {
    const state = await bar.readState(
      '000001043463,1666666263817,745f5b5c06b8d1859b6521e6df00d95dae2aeac70db4e8a3f233e618247000d7'
    );
  } catch (e) {
    console.trace('Main script error catch', {
      trace: JSON.parse(e.traceData),
      uuid: e.uuid
    });
  }
  //   const errors = state.cachedValue.errorMessages;
  //   const failedTxs = Object.keys(errors);
  //   let errNotEnoughBalance = 0;
  //   let errOthers = 0;
  //   let invalidTransfer = 0;
  //   let invalidValue = 0;
  //   failedTxs.forEach(txId => {
  //     if (errors[txId].includes("Caller balance not high enough")) {
  //         errNotEnoughBalance++;
  //     } else if (errors[txId].includes("Invalid token transfer.")) {
  //         invalidTransfer++;
  //     } else if (errors[txId].includes("Invalid value")) {
  //         invalidValue++;
  //     } else {
  //         console.log(errors[txId]);
  //         errOthers++;
  //         interactions[txId].tags.forEach(tag => {
  //             if (tag.name === 'Contract') {
  //                 if (!failingContracts[tag.value]) {
  //                     failingContracts[tag.value] = [];
  //                 }
  //                 failingContracts[tag.value].push(txId);
  //             }
  //         })

  //     }

  //   })
  //   console.log("Not enough balance " + errNotEnoughBalance);
  //   console.log("Invalid transfer " + invalidTransfer);
  //   console.log("Invalid value " + invalidValue);
  //   console.log("Others " + errOthers);
  //   console.log(errors);
  //   console.log(failingContracts);
  // console.log(Object.keys(contractTxId.cachedValue.validity).length);
  const filename = './dump_' + new Date().getTime();
  fs.writeFileSync(filename, bar.getCallStack().print());
  //   Object.keys(failingContracts).forEach(contractId => {
  //     console.log(contractId + " : " + failingContracts[contractId].length);
  //   })
})();
