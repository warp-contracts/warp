/* eslint-disable */
import Arweave from 'arweave';
import {
  LoggerFactory,
  MemCache,
  RedstoneGatewayContractDefinitionLoader,
  RedstoneStreamableInteractionsLoader,
  SmartWeaveNodeFactory
} from '../src';
import * as fs from 'fs';
import os from "os";
import {TsLogFactory} from '../src/logging/node/TsLogFactory';
import {ArweaveGatewayInteractionsLoader, RedstoneGatewayInteractionsLoader} from "../../smartweave-tags-encoding/.yalc/redstone-smartweave";
import {readContract} from "smartweave";

//LoggerFactory.use(new TsLogFactory());
LoggerFactory.INST.logLevel('error');
LoggerFactory.INST.logLevel('debug', 'Contract');
//LoggerFactory.INST.logLevel('debug', 'CacheableStateEvaluator');
LoggerFactory.INST.logLevel('debug', 'RedStoneStreamableInteractionsLoader');
LoggerFactory.INST.logLevel('debug', 'RedstoneGatewayContractDefinitionLoader');
//LoggerFactory.INST.logLevel('debug', 'DefaultStateEvaluator');
//LoggerFactory.INST.logLevel('debug', 'CacheableStateEvaluator');
//LoggerFactory.INST.logLevel('debug', 'RedStoneStreamableInteractionsLoader');

/*LoggerFactory.INST.logLevel('info', 'Contract');
LoggerFactory.INST.logLevel('debug', 'CacheableStateEvaluator');
LoggerFactory.INST.logLevel('debug', 'RedStoneStreamableInteractionsLoader');*/

async function main() {
  const logger = LoggerFactory.INST.create('Contract');

  const stringify = require('safe-stable-stringify');

  printTestInfo();

  const LOOT_CONTRACT = 'Daj-MNSnH55TDfxqC7v4eq0lKzVIwh98srUaWqyuZtY';
  const P_CONTRACT = 'SJ3l7474UHh3Dw6dWVT1bzsJ-8JvOewtGoDdOecWIZo';
  const DUH = 'w27141UQGgrCFhkiw9tL7A0-qWMQjbapU3mq2TfI4Cg';
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
    /*.setInteractionsLoader(
      new RedstoneGatewayInteractionsLoader('https://gateway.redstone.finance')
    )*/
    .setDefinitionLoader(
      new RedstoneGatewayContractDefinitionLoader('https://gateway.redstone.finance', arweave, new MemCache())
    )
    .build();

  const contract = smartweave.contract(DUH);

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

  const result = await contract.readState(850127);

  //const result2 = await readContract(arweave, DUH, 850127);

  const stats = contract.lastReadStateStats();

  logger.error('total evaluation: ', stats);

  logger.info(stringify(result.state));
  //logger.info(stringify(result2));
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
