/* eslint-disable */
import Arweave from 'arweave';
import {
  BenchmarkStats,
  LoggerFactory, MemCache, RedstoneGatewayContractDefinitionLoader,
  RedstoneGatewayInteractionsLoader,
  SmartWeaveWebFactory
} from '../src';

import {TsLogFactory} from '../src/logging/node/TsLogFactory';
import fs from 'fs';
import path from 'path';
import {FromFileInteractionsLoader} from './FromFileInteractionsLoader';
import {SmartWeaveNodeFactory} from '../src/core/node/SmartWeaveNodeFactory';
import {readContract} from "smartweave";
import {inspect} from "util";
import colors = module
import {max, mean, median, min, standardDeviation, variance} from "simple-statistics";

const stringify = require('safe-stable-stringify')


const logger = LoggerFactory.INST.create('Contract');

let os = require("os");

//LoggerFactory.use(new TsLogFactory());
LoggerFactory.INST.logLevel("fatal");
LoggerFactory.INST.logLevel("info", "Contract");


//LoggerFactory.INST.logLevel("info", "HandlerBasedContract");

/*LoggerFactory.INST.logLevel("debug", "ArweaveGatewayInteractionsLoader");
LoggerFactory.INST.logLevel("debug", "HandlerBasedContract");
LoggerFactory.INST.logLevel("debug", "ContractDefinitionLoader");
LoggerFactory.INST.logLevel("debug", "CacheableContractInteractionsLoader");*/


async function main() {
  const arweave = Arweave.init({
    host: 'arweave.net', // Hostname or IP address for a Arweave host
    port: 443, // Port
    protocol: 'https', // Network protocol http or https
    timeout: 60000, // Network request timeouts in milliseconds
    logging: false // Enable network request logging
  });

  const contractTxId = 'Daj-MNSnH55TDfxqC7v4eq0lKzVIwh98srUaWqyuZtY'; //844916
  //const contractTxId = 't9T7DIOGxx4VWXoCEeYYarFYeERTpWIC1V3y-BPZgKE'; //749180

  //const interactionsLoader = new FromFileInteractionsLoader(path.join(__dirname, 'data', 'interactions.json'));

  // const smartweave = SmartWeaveWebFactory.memCachedBased(arweave).setInteractionsLoader(interactionsLoader).build();


  /* const usedBefore = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100
   const contractR = smartweaveR.contract(contractTxId);
   const {state, validity} = await contractR.readState();
   const usedAfter = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100
   logger.warn("Heap used in MB", {
     usedBefore,
     usedAfter
   });*/

  const colors = require('colors');
  const stats = require('simple-statistics')

  console.log("Test info  ".bgRed);
  console.log("===============");

  console.log("  ", "OS       ".bgGrey, os.type() + " " + os.release() + " " + os.arch());
  console.log("  ", "Node.JS  ".bgGrey, process.versions.node);
  console.log("  ", "V8       ".bgGrey, process.versions.v8);

  let cpus = os.cpus().map(function (cpu) {
    return cpu.model;
  }).reduce(function (o, model) {
    if (!o[model]) o[model] = 0;
    o[model]++;
    return o;
  }, {});

  cpus = Object.keys(cpus).map(function (key) {
    return key + " \u00d7 " + cpus[key];
  }).join("\n");

  console.log("  ", "CPU      ".bgGrey, cpus);
  console.log("  ", "Memory   ".bgGrey, (os.totalmem() / 1024 / 1024 / 1024).toFixed(0), "GB");

  console.log("===============");
  console.log("  ", "Contract ".bgGrey, "t9T7DIOGxx4VWXoCEeYYarFYeERTpWIC1V3y-BPZgKE");
  console.log("  ", "Height   ".bgGrey, 749180);


  const Table = require('cli-table');

// instantiate
  const table = new Table({
    head: ['# Test:'.green, 'Gateway communication:'.green, 'State evaluation:'.green, 'Total:'.green]
    , colWidths: [10, 30, 20, 20]
  });

  const results: BenchmarkStats[] = [];

  for (let i = 1; i <= 10; i++) {

    const smartweaveR = SmartWeaveWebFactory
      .memCachedBased(arweave, 1)
      .setInteractionsLoader(
        new RedstoneGatewayInteractionsLoader("https://gateway.redstone.finance", {confirmed: true}))
      .setDefinitionLoader(
        new RedstoneGatewayContractDefinitionLoader("https://gateway.redstone.finance", arweave, new MemCache()))
      .build();

    const contract = smartweaveR.contract(contractTxId);
    await contract.readState(844916);

    const result = contract.lastReadStateStats();

    results.push(result);

    table.push(
      [`${i}`.magenta, result.gatewayCommunication + "ms", result.stateEvaluation + "ms", result.total + "ms"]
    );
  }

  console.log(table.toString());

  const tableStats = new Table({
    head: ['Statistics:'.green, 'Gateway communication:'.green, 'State evaluation:'.green, 'Total:'.green]
    , colWidths: [20, 30, 20, 20]
  });

  tableStats.push(
    ["Mean".cyan, mean(results.map(r => r.gatewayCommunication)) + "ms", mean(results.map(r => r.stateEvaluation)) + "ms", mean(results.map(r => r.total)) + "ms"],
    ["Median".cyan, median(results.map(r => r.gatewayCommunication)) + "ms", median(results.map(r => r.stateEvaluation)) + "ms", median(results.map(r => r.total)) + "ms"],
    ["Min".cyan, min(results.map(r => r.gatewayCommunication)) + "ms", min(results.map(r => r.stateEvaluation)) + "ms", min(results.map(r => r.total)) + "ms"],
    ["Max".cyan, max(results.map(r => r.gatewayCommunication)) + "ms", max(results.map(r => r.stateEvaluation)) + "ms", max(results.map(r => r.total)) + "ms"],
    ["Std. Dev.".cyan, standardDeviation(results.map(r => r.gatewayCommunication)).toFixed(2) + "ms", standardDeviation(results.map(r => r.stateEvaluation)).toFixed(2) + "ms", standardDeviation(results.map(r => r.total)).toFixed(2) + "ms"],
  );

  console.log(tableStats.toString());


  //const result2 = await readContract(arweave, "t9T7DIOGxx4VWXoCEeYYarFYeERTpWIC1V3y-BPZgKE")


  //fs.writeFileSync(path.join(__dirname, 'data', 'validity.json'), JSON.stringify(validity));

  //fs.writeFileSync(path.join(__dirname, 'data', 'validity_old.json'), JSON.stringify(result.validity));
  //fs.writeFileSync(path.join(__dirname, 'data', 'state_new.json'), stringify(result.state).trim());
  //fs.writeFileSync(path.join(__dirname, 'data', 'state_old.json'), stringify(result2).trim());
  //fs.writeFileSync(path.join(__dirname, 'data', 'state_arweave.json'), JSON.stringify(result.state));

  // console.log('second read');
  // await lootContract.readState();
}

main().catch((e) => console.error(e));
