/* eslint-disable */
import {defaultCacheOptions, LoggerFactory, Warp, WarpFactory} from '../src';
import os from 'os';
import {WarpPlugin, WarpPluginType} from "../src/core/WarpPlugin";
import {GQLNodeInterface} from "smartweave/lib/interfaces/gqlResult";
import {initPubSub, subscribe} from "warp-contracts-pubsub";
import {JWKInterface} from "arweave/web/lib/wallet";
import fs from "fs";

const logger = LoggerFactory.INST.create('Contract');

//LoggerFactory.use(new TsLogFactory());
LoggerFactory.INST.logLevel('info');
LoggerFactory.INST.logLevel('debug', 'WarpSubscriptionPlugin');
//LoggerFactory.INST.logLevel('debug', 'CacheableStateEvaluator');

global.WebSocket = require('ws');


initPubSub()

async function main() {
  printTestInfo();

  const heapUsedBefore = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
  const rssUsedBefore = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;

  interface InteractionMessage {
    contractTxId: string,
    sortKey: string,
    lastSortKey: string,
    interaction: GQLNodeInterface
  }


  abstract class WarpSubscriptionPlugin<R> implements WarpPlugin<InteractionMessage, Promise<R>> {
    protected readonly logger = LoggerFactory.INST.create(WarpSubscriptionPlugin.name);

    constructor(protected readonly contractTxId: string, protected readonly warp: Warp) {
      subscribe(`interactions/${contractTxId}`, async ({data}) => {
        const message = JSON.parse(data);
        this.logger.debug('New message received', message);
        await this.process(message);
      }, console.error)
        .then(() => {
          this.logger.debug('Subscribed to interactions for', this.contractTxId);
        })
        .catch(e => {
          this.logger.error('Error while subscribing', e);
        });
    }

    abstract process(input: InteractionMessage): Promise<R>;

    type(): WarpPluginType {
      return 'subscription';
    }
  }


  class StateUpdatePlugin extends WarpSubscriptionPlugin<Promise<any>> {
    async process(input: InteractionMessage): Promise<any> {
      this.logger.debug('From implementation', input);
      const lastStoredKey = (await warp.stateEvaluator.latestAvailableState(this.contractTxId))?.sortKey;
      if (lastStoredKey?.localeCompare(input.lastSortKey) === 0) {
        this.logger.debug('Safe to use new interaction');
        return await warp.contract(this.contractTxId)
          .readStateFor([input.interaction]);
      } else {
        this.logger.debug('Unsafe to use new interaction');
        return await warp.contract(this.contractTxId).readState();
      }
    }
  }


  const warp = WarpFactory
    .forMainnet({...defaultCacheOptions, inMemory: false});

  const plugin = new StateUpdatePlugin("Ws9hhYckc-zSnVmbBep6q_kZD5zmzYzDmgMC50nMiuE", warp)
  warp.use(plugin);


  let wallet: JWKInterface = readJSON('./.secrets/33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA.json');
  ;

  try {
    const contract = warp
      .contract("Ws9hhYckc-zSnVmbBep6q_kZD5zmzYzDmgMC50nMiuE")
      .connect(wallet);
    await contract.writeInteraction({
      function: 'vrf'
    }, {vrf: true});

    /* const cacheResult = await contract
       .setEvaluationOptions({
       })
       .readState();

     console.log(cacheResult.cachedValue.state);*/
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
