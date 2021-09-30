import Arweave from 'arweave';
import { LoggerFactory } from '../src';
import { TsLogFactory } from '../src/logging/node/TsLogFactory';
import fs from 'fs';
import path from 'path';
import { SmartWeaveWebFactory } from '../src/core/web/SmartWeaveWebFactory';
import { FromFileInteractionsLoader } from './FromFileInteractionsLoader';
import { readContract } from 'smartweave';

async function main() {
  LoggerFactory.use(new TsLogFactory());
  LoggerFactory.INST.logLevel('debug');

  const arweave = Arweave.init({
    host: 'arweave.net', // Hostname or IP address for a Arweave host
    port: 443, // Port
    protocol: 'https', // Network protocol http or https
    timeout: 60000, // Network request timeouts in milliseconds
    logging: false // Enable network request logging
  });

  const contractTxId = 'Daj-MNSnH55TDfxqC7v4eq0lKzVIwh98srUaWqyuZtY';

  const interactionsLoader = new FromFileInteractionsLoader(path.join(__dirname, 'data', 'interactions.json'));

  const smartweave = SmartWeaveWebFactory.memCachedBased(arweave)
    .setInteractionsLoader(interactionsLoader)
    .overwriteSource({
      [contractTxId]: fs.readFileSync(path.join(__dirname, 'data', 'loot-contract-mods.js'), 'utf-8')
    });

  const lootContract = smartweave.contract(contractTxId);

  const { state, validity } = await lootContract.readState();

  //fs.writeFileSync(path.join(__dirname, 'data', 'validity.json'), JSON.stringify(validity));

  //const result = await readContract(arweave, contractTxId, undefined, true);

  //fs.writeFileSync(path.join(__dirname, 'data', 'validity_old.json'), JSON.stringify(result.validity));
  //fs.writeFileSync(path.join(__dirname, 'data', 'state_old.json'), JSON.stringify(result.state));
}

main().catch((e) => console.error(e));
