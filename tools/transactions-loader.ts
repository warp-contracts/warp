import Arweave from 'arweave';
import { LoggerFactory } from '../src';
import { TsLogFactory } from '../src/logging/node/TsLogFactory';
import fs from 'fs';
import path from 'path';
import { ContractInteractionsLoader } from '../src/core/modules/impl/ContractInteractionsLoader';

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

  const transactionsLoader = new ContractInteractionsLoader(arweave);

  const result = await transactionsLoader.load('LkfzZvdl_vfjRXZOPjnov18cGnnK3aDKj0qSQCgkCX8', 0, 779820);

  console.log(result.length);

  //fs.writeFileSync(path.join(__dirname, 'data', 'transactions-2.json'), JSON.stringify(result));
}

main().catch((e) => console.error(e));
