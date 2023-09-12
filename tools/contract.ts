/* eslint-disable */
import {defaultCacheOptions, LoggerFactory, WarpFactory} from '../src';
import os from 'os';
import {JWKInterface} from "arweave/web/lib/wallet";
import fs from "fs";
import { EventEmitter } from "node:events";

const logger = LoggerFactory.INST.create('Contract');

//LoggerFactory.use(new TsLogFactory());
//LoggerFactory.INST.logLevel('error');

LoggerFactory.INST.logLevel('debug');
//LoggerFactory.INST.logLevel('info', 'DefaultStateEvaluator');

const eventEmitter = new EventEmitter();
eventEmitter.on('progress-notification', (data) => {
  // events.progress(data.contractTxId, data.message);
});

async function main() {
  printTestInfo();

  const heapUsedBefore = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
  const rssUsedBefore = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;

  const warp = WarpFactory
    .forMainnet({ ...defaultCacheOptions, inMemory: true });

  try {
    const contract = warp
      .contract("KvgS1Ikrc_gnveocS_YMgRmBGH5eic61dFXKWpSzjMw")
      .setEvaluationOptions({
        allowBigInt: true,
        maxCallDepth: 666,
        internalWrites: true,
      });
    const result = await contract.readState("000001259416,1694451827083,8e0c1951d00f9f4fdc5acdab2eadaf312e70f5dab17ecf53bc045fdb9aa419e7");
    console.dir(result.cachedValue.validity, {depth: null});
  } catch (e) {
    console.error(e);
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

function readJSON(path: string): JWKInterface {
  const content = fs.readFileSync(path, "utf-8");
  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error(`File "${path}" does not contain a valid JSON`);
  }
}
