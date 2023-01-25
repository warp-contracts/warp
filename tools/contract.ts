/* eslint-disable */
import {defaultCacheOptions, LoggerFactory, WarpFactory} from '../src';
import os from 'os';
import {JWKInterface} from "arweave/web/lib/wallet";
import fs from "fs";

const logger = LoggerFactory.INST.create('Contract');

//LoggerFactory.use(new TsLogFactory());
LoggerFactory.INST.logLevel('error');

LoggerFactory.INST.logLevel('error', 'CacheableStateEvaluator');

async function main() {
  printTestInfo();

  const heapUsedBefore = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
  const rssUsedBefore = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;

  const warp = WarpFactory
    .forMainnet({...defaultCacheOptions, inMemory: false});

  let wallet: JWKInterface = readJSON('./.secrets/33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA.json');

  try {
    const contract = warp
      .contract("OrO8n453N6bx921wtsEs-0OCImBLCItNU5oSbFKlFuU")
    const cacheResult = await contract
      .setEvaluationOptions({
        allowBigInt: true,
        internalWrites: true,
        unsafeClient: "allow",
      })
      .readState('000000910492,1649597937854,be3250a325c520e72f6301ea7eee0e554d54b3c74778c11a7af72dd5988049dd');
    console.log(cacheResult.sortKey);

    const result2 = await contract.readStateFor('000000910492,1649597937854,be3250a325c520e72f6301ea7eee0e554d54b3c74778c11a7af72dd5988049dd',
      [{
        "id": "YOIBrNDTwRoZRmlfTZhyjg7ygdjzqV9bZb6pZmXQzeE",
        "fee": {
          "winston": "62411260"
        },
        "tags": [
          {
            "name": "App-Name",
            "value": "SmartWeaveAction"
          },
          {
            "name": "App-Version",
            "value": "0.3.0"
          },
          {
            "name": "SDK",
            "value": "RedStone"
          },
          {
            "name": "Contract",
            "value": "OrO8n453N6bx921wtsEs-0OCImBLCItNU5oSbFKlFuU"
          },
          {
            "name": "Input",
            "value": "{\"function\":\"registerProvider\",\"data\":{\"provider\":{\"adminsPool\":[\"saRRtnBNekVmBvx_3vNqQ2n2zhG7v3KCGsHbKioS5Sc\"],\"profile\":{\"name\":\"RedStone Avalanche prod 5\",\"description\":\"Most popular tokens from the Avalanche ecosystem\",\"url\":\"https://redstone.finance/\",\"imgUrl\":\"https://redstone.finance/assets/img/redstone-logo-full.svg\"},\"manifests\":[{\"changeMessage\":\"initial manifest\",\"lockedHours\":0,\"manifestTxId\":\"y7ppr6m9MuP65Fiivd9CX84qcPLoYBMifUrFK3jXw2k\"}]}}}"
          }
        ],
        "block": {
          "id": "fZsSqrjTNX3IDVkDuCVX512ZnJ3HU9jjZ9Dg_7b471BWeT1sJ83c7RDMWCWd-1Mt",
          "height": 910563,
          "timestamp": 1649606400
        },
        "owner": {
          "address": "saRRtnBNekVmBvx_3vNqQ2n2zhG7v3KCGsHbKioS5Sc"
        },
        "source": "redstone-sequencer",
        "sortKey": "000000910564,1649606636671,94a0b260d85920f86100fb200c60307ea0b30b70b4d2970049a567f53cd6f9c0",
        "quantity": {
          "winston": "0"
        },
        "recipient": ""
      } as any]
    )

    console.log(result2.sortKey);
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
