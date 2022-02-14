/* eslint-disable */
import Arweave from 'arweave';
import {
  LoggerFactory,
  MemCache,
  RedstoneGatewayContractDefinitionLoader,
  RedStoneStreamableInteractionsLoader,
  SmartWeaveNodeFactory
} from '../src';
import * as fs from 'fs';
import os from "os";
import {TsLogFactory} from '../src/logging/node/TsLogFactory';

const logger = LoggerFactory.INST.create('Contract');

//LoggerFactory.use(new TsLogFactory());
LoggerFactory.INST.logLevel('error');
//LoggerFactory.INST.logLevel('debug', 'CacheableStateEvaluator');
//LoggerFactory.INST.logLevel('debug', 'RedStoneStreamableInteractionsLoader');

/*LoggerFactory.INST.logLevel('info', 'Contract');
LoggerFactory.INST.logLevel('debug', 'CacheableStateEvaluator');
LoggerFactory.INST.logLevel('debug', 'RedStoneStreamableInteractionsLoader');*/

async function main() {
  printTestInfo();

  const LOOT_CONTRACT = 'Daj-MNSnH55TDfxqC7v4eq0lKzVIwh98srUaWqyuZtY';
  const CACHE_PATH = 'cache.sqlite.db';

  const heapUsedBefore = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
  const rssUsedBefore = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;

  const arweave = Arweave.init({
    host: 'arweave.net', // Hostname or IP address for a Arweave host
    port: 443, // Port
    protocol: 'https', // Network protocol http or https
    timeout: 60000, // Network request timeouts in milliseconds
    logging: false // Enable network request logging
  });

  if (fs.existsSync(CACHE_PATH)) {
    fs.rmSync(CACHE_PATH);
  }

  const smartweave = SmartWeaveNodeFactory.memCachedBased(arweave)
    .setInteractionsLoader(
      new RedStoneStreamableInteractionsLoader('http://localhost:5666', {notCorrupted: true})
    )
    .setDefinitionLoader(
      new RedstoneGatewayContractDefinitionLoader('http://localhost:5666', arweave, new MemCache())
    )
    .build();

  const contract = smartweave.contract(LOOT_CONTRACT);

  await contract.readState(844916);

  const heapUsedAfter = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
  const rssUsedAfter = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;
  logger.warn('Heap used in MB', {
    usedBefore: heapUsedBefore,
    usedAfter: heapUsedAfter
  });

  logger.warn('RSS used in MB', {
    usedBefore: rssUsedBefore,
    usedAfter: rssUsedAfter
  });

  const result = contract.lastReadStateStats();

  logger.error('total evaluation: ', result);
  return;
}

function printTestInfo() {
  console.log("Test info  ");
  console.log("===============");
  console.log("  ", "OS       ", os.type() + " " + os.release() + " " + os.arch());
  console.log("  ", "Node.JS  ", process.versions.node);
  console.log("  ", "V8       ", process.versions.v8);
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
  console.log("  ", "CPU      ", cpus);
  console.log("  ", "Memory   ", (os.totalmem() / 1024 / 1024 / 1024).toFixed(0), "GB");
  console.log("===============");
}

main().catch((e) => console.error(e));
