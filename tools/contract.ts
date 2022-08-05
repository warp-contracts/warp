/* eslint-disable */
import Arweave from 'arweave';
import {defaultCacheOptions, LoggerFactory, WarpFactory} from '../src';
import * as fs from 'fs';
import knex from 'knex';
import os from 'os';
import path from "path";
import stringify from "safe-stable-stringify";

const logger = LoggerFactory.INST.create('Contract');

//LoggerFactory.use(new TsLogFactory());
LoggerFactory.INST.logLevel('debug');
LoggerFactory.INST.logLevel('debug', 'ArweaveGatewayInteractionsLoader');
LoggerFactory.INST.logLevel('info', 'CacheableStateEvaluator');
LoggerFactory.INST.logLevel('info', 'WASM:Rust');
//LoggerFactory.INST.logLevel('debug', 'CacheableStateEvaluator');

async function main() {
  printTestInfo();

  const heapUsedBefore = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
  const rssUsedBefore = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;

  const arweave = Arweave.init({
/*    host: 'arweave.testnet1.bundlr.network',*/ // Hostname or IP address for a Arweave host
    host: 'arweave.net',
    port: 443, // Port
    protocol: 'https', // Network protocol http or https
    timeout: 60000, // Network request timeouts in milliseconds
    logging: false // Enable network request logging
  });


  const warp = WarpFactory.forMainnet({...defaultCacheOptions, inMemory: true});
  try {
    const contract = warp.contract("Daj-MNSnH55TDfxqC7v4eq0lKzVIwh98srUaWqyuZtY");
    const {state, validity, errorMessages} = await contract.readState();

    console.log(state);
  } catch (e) {
    throw new Error("Gotcha!");
  }

  const heapUsedAfter = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
  const rssUsedAfter = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;
  logger.warn('Heap used in MB', {
    usedBefore: heapUsedBefore,
    usedAfter: heapUsedAfter
  });

  logger.info('RSS used in MB', {
    usedBefore: rssUsedBefore,
    usedAfter: rssUsedAfter
  });

  return;
}

function printTestInfo() {
  console.log('Test info  ');
  console.log('===============');
  console.log('  ', 'OS       ', os.type() + ' ' + os.release() + ' ' + os.arch());
  console.log('  ', 'Node.JS  ', process.versions.node);
  console.log('  ', 'V8       ', process.versions.v8);
  let cpus = os
    .cpus()
    .map(function (cpu) {
      return cpu.model;
    })
    .reduce(function (o, model) {
      if (!o[model]) o[model] = 0;
      o[model]++;
      return o;
    }, {});

  cpus = Object.keys(cpus)
    .map(function (key) {
      return key + ' \u00d7 ' + cpus[key];
    })
    .join('\n');
  console.log('  ', 'CPU      ', cpus);
  console.log('  ', 'Memory   ', (os.totalmem() / 1024 / 1024 / 1024).toFixed(0), 'GB');
  console.log('===============');
}

main().catch((e) => console.error(e));
