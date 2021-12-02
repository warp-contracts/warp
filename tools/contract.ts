/* eslint-disable */
import Arweave from 'arweave';
import { LoggerFactory } from '../src';
import { TsLogFactory } from '../src/logging/node/TsLogFactory';
import fs from 'fs';
import path from 'path';
import { FromFileInteractionsLoader } from './FromFileInteractionsLoader';
import { SmartWeaveNodeFactory } from '../src/core/node/SmartWeaveNodeFactory';

LoggerFactory.use(new TsLogFactory());
LoggerFactory.INST.logLevel('debug');

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
  const smartweave = SmartWeaveNodeFactory.fileCached(arweave, 'cache');

  const lootContract = smartweave.contract(contractTxId)
    .setEvaluationOptions({updateCacheForEachInteraction: false});

  const { state, validity } = await lootContract.readState();

  //fs.writeFileSync(path.join(__dirname, 'data', 'validity.json'), JSON.stringify(validity));

  //fs.writeFileSync(path.join(__dirname, 'data', 'validity_old.json'), JSON.stringify(result.validity));
  fs.writeFileSync(path.join(__dirname, 'data', 'state.json'), JSON.stringify(state));

  // console.log('second read');
  // await lootContract.readState();
}

main().catch((e) => console.error(e));
