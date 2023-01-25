/* eslint-disable */
import {defaultCacheOptions, LoggerFactory, Warp, WarpFactory} from '../src';
import os from 'os';
import {JWKInterface} from "arweave/web/lib/wallet";
import fs from "fs";

const logger = LoggerFactory.INST.create('Contract');

//LoggerFactory.use(new TsLogFactory());
LoggerFactory.INST.logLevel('error');

LoggerFactory.INST.logLevel('debug', 'CacheableStateEvaluator');

async function main() {
  printTestInfo();

  const heapUsedBefore = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
  const rssUsedBefore = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;

  const warp = WarpFactory
    .forMainnet({...defaultCacheOptions, inMemory: true});

  let wallet: JWKInterface = readJSON('./.secrets/33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA.json');

  try {
    const contract = warp
      .contract("UBn9JE5iMyQ-nee7bjoE9oNbgTsHDMT7IfPNzZpvyyU")
    const cacheResult = await contract
      .readState('000001105599,1674667555600,3ffc7b84a6ea98d21fe13a773ad17d051d2aaa402b229d01acd189b4431085fa');
    console.log(cacheResult.cachedValue.validity);

    const result2 = await contract.readStateFor('000001105599,1674667555600,3ffc7b84a6ea98d21fe13a773ad17d051d2aaa402b229d01acd189b4431085fa',
      [{
        "id": "-HX10_iGrTRb1iKRoQYrm_RvXfP9plsyyJANa_kXybw",
        "fee": {"winston": "72600854"},
        "vrf": null,
        "tags": [{"name": "App-Name", "value": "SmartWeaveAction"}, {
          "name": "App-Version",
          "value": "0.3.0"
        }, {"name": "SDK", "value": "Warp"}, {
          "name": "Contract",
          "value": "UBn9JE5iMyQ-nee7bjoE9oNbgTsHDMT7IfPNzZpvyyU"
        }, {
          "name": "Input",
          "value": "{\"function\":\"transfer\",\"target\":\"M-mpNeJbg9h7mZ-uHaNsa5jwFFRAq0PsTkNWXJ-ojwI\",\"qty\":100}"
        }],
        "block": {
          "id": "FtFO_auDIaR-caLom7Zl8unOPRJLU8zel1XvuYxDJO_fsVjz45YLjKiTK7tDvZ5k",
          "height": 1105599,
          "timestamp": 1674667290
        },
        "owner": {"address": "33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA"},
        "source": "redstone-sequencer",
        "sortKey": "000001105599,1674667555795,7298532efd6c0aa28fad539bbe7a37007a49719d42e7a5dff5a3a00d28086297",
        "testnet": null,
        "quantity": {"winston": "0"},
        "recipient": "",
        "lastSortKey": "000001105599,1674667555600,3ffc7b84a6ea98d21fe13a773ad17d051d2aaa402b229d01acd189b4431085fa"
      } as any]
    )

    console.log(result2.cachedValue.validity);
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
