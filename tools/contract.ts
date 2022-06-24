/* eslint-disable */
import Arweave from 'arweave';
import {LoggerFactory, WarpNodeFactory} from '../src';
import * as fs from 'fs';
import knex from 'knex';
import os from 'os';

const logger = LoggerFactory.INST.create('Contract');

//LoggerFactory.use(new TsLogFactory());
LoggerFactory.INST.logLevel('debug');
LoggerFactory.INST.logLevel('info', 'Contract');
//LoggerFactory.INST.logLevel('debug', 'DefaultStateEvaluator');
//LoggerFactory.INST.logLevel('debug', 'CacheableStateEvaluator');

async function main() {
  printTestInfo();

  const PIANITY_CONTRACT = 'SJ3l7474UHh3Dw6dWVT1bzsJ-8JvOewtGoDdOecWIZo';
  const PIANITY_COMMUNITY_CONTRACT = 'n05LTiuWcAYjizXAu-ghegaWjL89anZ6VdvuHcU6dno';
  const LOOT_CONTRACT = 'Daj-MNSnH55TDfxqC7v4eq0lKzVIwh98srUaWqyuZtY';
  const KOI_CONTRACT = '38TR3D8BxlPTc89NOW67IkQQUPR8jDLaJNdYv-4wWfM';

  const localC = "iwlOHr4oM37YGKyQOWxZ-CUiEUKNtiFEaRNwz8Pwx_k";
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

  const knexConfig = knex({
    client: 'sqlite3',
    connection: {
      filename: `tools/data/smartweave_just_one.sqlite`
    },
    useNullAsDefault: true
  });
  const warp = (await WarpNodeFactory.knexCachedBased(arweave, knexConfig, 1))
    .useRedStoneGateway().build();
  const contract = warp.contract("3vAx5cIFhwMihrNJgGx3CoAeZTOjG7LeIs9tnbBfL14");
  await contract.readState();
  await contract.readState();

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

  //const result = contract.lastReadStateStats();

  //logger.warn('total evaluation: ', result);
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
