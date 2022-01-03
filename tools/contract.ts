/* eslint-disable */
import Arweave from 'arweave';
import {LoggerFactory, RedstoneGatewayInteractionsLoader, SmartWeaveWebFactory} from '../src';
import {TsLogFactory} from '../src/logging/node/TsLogFactory';
import fs from 'fs';
import path from 'path';
import {FromFileInteractionsLoader} from './FromFileInteractionsLoader';
import {SmartWeaveNodeFactory} from '../src/core/node/SmartWeaveNodeFactory';

const logger = LoggerFactory.INST.create('Contract');

// LoggerFactory.use(new TsLogFactory());
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
  //const contractTxId = 't9T7DIOGxx4VWXoCEeYYarFYeERTpWIC1V3y-BPZgKE';

  //const interactionsLoader = new FromFileInteractionsLoader(path.join(__dirname, 'data', 'interactions.json'));

  // const smartweave = SmartWeaveWebFactory.memCachedBased(arweave).setInteractionsLoader(interactionsLoader).build();
  const smartweaveR = SmartWeaveWebFactory
    .memCachedBased(arweave, 1).build();

 /* const usedBefore = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100
  const contractR = smartweaveR.contract(contractTxId);
  const {state, validity} = await contractR.readState();
  const usedAfter = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100
  logger.warn("Heap used in MB", {
    usedBefore,
    usedAfter
  });*/

  const smartweave = SmartWeaveWebFactory.memCached(arweave);
  const contract = smartweave.contract(contractTxId).setEvaluationOptions({
    updateCacheForEachInteraction: false
  });
  const result = await contract.readState();


  //fs.writeFileSync(path.join(__dirname, 'data', 'validity.json'), JSON.stringify(validity));

  //fs.writeFileSync(path.join(__dirname, 'data', 'validity_old.json'), JSON.stringify(result.validity));
  //fs.writeFileSync(path.join(__dirname, 'data', 'state_redstone.json'), JSON.stringify(state));
  //fs.writeFileSync(path.join(__dirname, 'data', 'state_arweave.json'), JSON.stringify(result.state));

  // console.log('second read');
  // await lootContract.readState();
}

main().catch((e) => console.error(e));
