/* eslint-disable */
const Arweave = require('arweave');
const { LoggerFactory } = require('../lib/cjs/logging/LoggerFactory');
const { RedstoneGatewayInteractionsLoader } = require('../lib/cjs/core/modules/impl/RedstoneGatewayInteractionsLoader');
const { SmartWeaveWebFactory } = require('../lib/cjs/core/web/SmartWeaveWebFactory');
const {TsLogFactory} = require('../lib/cjs/logging/node/TsLogFactory');
const fs = require('fs');
const path =require('path');

const logger = LoggerFactory.INST.create('Contract');

LoggerFactory.use(new TsLogFactory());
LoggerFactory.INST.logLevel('info');


async function main() {
  const arweave = Arweave.init({
    host: 'arweave.net', // Hostname or IP address for a Arweave host
    port: 443, // Port
    protocol: 'https', // Network protocol http or https
    timeout: 60000, // Network request timeouts in milliseconds
    logging: false // Enable network request logging
  });

  const contractTxId = '-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ';

  //const interactionsLoader = new FromFileInteractionsLoader(path.join(__dirname, 'data', 'interactions.json'));

  // const smartweave = SmartWeaveWebFactory.memCachedBased(arweave).setInteractionsLoader(interactionsLoader).build();
  const smartweave = SmartWeaveWebFactory
    .memCachedBased(arweave, 1)
    .setInteractionsLoader(new RedstoneGatewayInteractionsLoader(
      'https://gateway.redstone.finance')
    ).build();

  const usedBefore = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100
  const lootContract = smartweave.contract(contractTxId)
    .setEvaluationOptions({updateCacheForEachInteraction: true});
  const {state, validity} = await lootContract.readState();
  const usedAfter = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100
  logger.warn("Heap used in MB", {
    usedBefore,
    usedAfter
  });


  //fs.writeFileSync(path.join(__dirname, 'data', 'validity.json'), JSON.stringify(validity));

  //fs.writeFileSync(path.join(__dirname, 'data', 'validity_old.json'), JSON.stringify(result.validity));
  fs.writeFileSync(path.join(__dirname, 'data', 'state.json'), JSON.stringify(state));

  // console.log('second read');
  // await lootContract.readState();
}

main().catch((e) => console.error(e));
