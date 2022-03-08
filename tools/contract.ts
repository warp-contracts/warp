/* eslint-disable */
import Arweave from 'arweave';
import {
  LoggerFactory,
  MemCache,
  RedstoneGatewayContractDefinitionLoader,
  RedstoneGatewayInteractionsLoader,
  SmartWeaveNodeFactory
} from '../src';
import * as fs from 'fs';
import knex from 'knex';
import os from 'os';
import { readJSON } from '../../redstone-smartweave-examples/src/_utils';
import { TsLogFactory } from '../src/logging/node/TsLogFactory';
import path from "path";
import stringify from "safe-stable-stringify";
import {readContract} from "smartweave";

const logger = LoggerFactory.INST.create('Contract');

//LoggerFactory.use(new TsLogFactory());
LoggerFactory.INST.logLevel('error');
//LoggerFactory.INST.logLevel('info', 'Contract');
//LoggerFactory.INST.logLevel('debug', 'DefaultStateEvaluator');
//LoggerFactory.INST.logLevel('error', 'CacheableStateEvaluator');

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

  const koi_source = fs.readFileSync(path.join(__dirname, 'data', 'koi-source.js'), "utf-8");

  const smartweave = SmartWeaveNodeFactory.memCachedBased(arweave)
    .setInteractionsLoader(
      new RedstoneGatewayInteractionsLoader('https://gateway.redstone.finance')
    )
    .overwriteSource({
      ["egfnrQFu-xDNgl1x04HlH6-wGKcHVKMF7U5Nsc-1USA"]: "export async function handle (state, action) {\n" +
      "    const puzzles = state.puzzles\n" +
      "    const input = action.input\n" +
      "    const caller = action.caller\n" +
      "\n" +
      "    if (input.function === 'create') {\n" +
      "        const solution_hash = input.solution_hash\n" +
      "        const file_id = input.file_id\n" +
      "\n" +
      "        if (!solution_hash) {\n" +
      "            throw new ContractError('No solution hash provided')\n" +
      "        }\n" +
      "\n" +
      "        if (!file_id) {\n" +
      "            throw new ContractError('No file id specified')\n" +
      "        }\n" +
      "\n" +
      "        if (solution_hash in puzzles) {\n" +
      "            throw new ContractError('Puzzle already exists')\n" +
      "        } else {\n" +
      "            puzzles[solution_hash] = {\n" +
      "                \"file_id\": file_id,\n" +
      "                \"creator\": caller,\n" +
      "                \"winner\": null\n" +
      "            }\n" +
      "        }\n" +
      "\n" +
      "        return { state }\n" +
      "    }\n" +
      "\n" +
      "    if (input.function === 'solve') {\n" +
      "        const solution = input.solution\n" +
      "        const solution_hash = input.solution_hash\n" +
      "\n" +
      "        if (solution_hash in puzzles) {\n" +
      "            const solution_buffer = SmartWeave.arweave.utils.stringToBuffer(solution)\n" +
      "            const calculated_hash =\n" +
      "                SmartWeave.arweave.utils.bufferTob64Url(\n" +
      "                    await SmartWeave.arweave.utils.crypto.hash(solution_buffer)\n" +
      "                )\n" +
      "            if (calculated_hash === solution_hash){\n" +
      "                puzzles[solution_hash].winner = caller\n" +
      "            }\n" +
      "        } else {\n" +
      "            throw new ContractError('Puzzle not found')\n" +
      "        }\n" +
      "\n" +
      "        return { state }\n" +
      "    }\n" +
      "\n" +
      "    throw new ContractError(`No function supplied or function not recognised: \"${input.function}\"`)\n" +
      "}\n",
    });

  const jwk = readJSON('../redstone-node/.secrets/redstone-jwk.json');
  const contract = smartweave
    .contract("egfnrQFu-xDNgl1x04HlH6-wGKcHVKMF7U5Nsc-1USA")
    .setEvaluationOptions({
      sequencerAddress: 'http://localhost:5666/',
      updateCacheForEachInteraction: false
    })
    .connect(jwk);
 /* const bundledInteraction = await contract.bundleInteraction({
    function: 'generate'
  });

  logger.info('Bundled interaction', bundledInteraction);*/

  // bundlr balance I-5rWUehEv-MjdK9gFw09RxfSLQX9DIHxG614Wf8qo0 -h https://node1.bundlr.network/ -c arweave

  const {state, validity} = await contract.readState();

  //const state = readContract(arweave, KOI_CONTRACT);

  fs.writeFileSync(path.join(__dirname, 'data', 'koi-proper-state_2.json'), stringify(state));

  logger.info("State", state);

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

  logger.warn('total evaluation: ', result);
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
