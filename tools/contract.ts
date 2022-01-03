/* eslint-disable */
import Arweave from 'arweave';
import {
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

const stringify = require('safe-stable-stringify')


const logger = LoggerFactory.INST.create('Contract');

//LoggerFactory.use(new TsLogFactory());
LoggerFactory.INST.logLevel("error");
LoggerFactory.INST.logLevel("debug", "ArweaveGatewayInteractionsLoader");
LoggerFactory.INST.logLevel("debug", "HandlerBasedContract");
LoggerFactory.INST.logLevel("debug", "ContractDefinitionLoader");
LoggerFactory.INST.logLevel("debug", "CacheableContractInteractionsLoader");



async function main() {
  const arweave = Arweave.init({
    host: 'arweave.net', // Hostname or IP address for a Arweave host
    port: 443, // Port
    protocol: 'https', // Network protocol http or https
    timeout: 60000, // Network request timeouts in milliseconds
    logging: false // Enable network request logging
  });

  const contractTxId = 'Daj-MNSnH55TDfxqC7v4eq0lKzVIwh98srUaWqyuZtY';
  //const contractTxId = 't9T7DIOGxx4VWXoCEeYYarFYeERTpWIC1V3y-BPZgKE'; //749180

  //const interactionsLoader = new FromFileInteractionsLoader(path.join(__dirname, 'data', 'interactions.json'));

  // const smartweave = SmartWeaveWebFactory.memCachedBased(arweave).setInteractionsLoader(interactionsLoader).build();
  const smartweaveR = SmartWeaveWebFactory
    .memCachedBased(arweave, 1)
    .setInteractionsLoader(
      new RedstoneGatewayInteractionsLoader("https://gateway.redstone.finance"))
    .setDefinitionLoader(
      new RedstoneGatewayContractDefinitionLoader("http://localhost:5666", arweave, new MemCache()))
    .build();

 /* const usedBefore = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100
  const contractR = smartweaveR.contract(contractTxId);
  const {state, validity} = await contractR.readState();
  const usedAfter = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100
  logger.warn("Heap used in MB", {
    usedBefore,
    usedAfter
  });*/

  const smartweave = SmartWeaveWebFactory.memCached(arweave);
  const contract = smartweaveR.contract(contractTxId).setEvaluationOptions({
    updateCacheForEachInteraction: true
  });
  const result = await contract.readState();

  //const result2 = await readContract(arweave, "t9T7DIOGxx4VWXoCEeYYarFYeERTpWIC1V3y-BPZgKE")


  //fs.writeFileSync(path.join(__dirname, 'data', 'validity.json'), JSON.stringify(validity));

  //fs.writeFileSync(path.join(__dirname, 'data', 'validity_old.json'), JSON.stringify(result.validity));
  fs.writeFileSync(path.join(__dirname, 'data', 'state_new.json'), stringify(result.state).trim());
  //fs.writeFileSync(path.join(__dirname, 'data', 'state_old.json'), stringify(result2).trim());
  //fs.writeFileSync(path.join(__dirname, 'data', 'state_arweave.json'), JSON.stringify(result.state));

  // console.log('second read');
  // await lootContract.readState();
}

main().catch((e) => console.error(e));
