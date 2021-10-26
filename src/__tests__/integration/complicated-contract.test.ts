import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, HandlerBasedContract, LoggerFactory, SmartWeave, SmartWeaveNodeFactory } from '@smartweave';
import path from 'path';

let arweave: Arweave;
let arlocal: ArLocal;
let smartweave: SmartWeave;
let contract: Contract<ExampleContractState>;

interface ExampleContractState {
  counter: number;
}
describe('Testing the SmartWeave client', () => {
  let contractSrc: string;
  let initialState: string;

  let wallet: JWKInterface;
  let walletAddress: string;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1800, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1800,
      protocol: 'http'
    });

    LoggerFactory.INST.logLevel('error');

    smartweave = SmartWeaveNodeFactory.memCached(arweave);

    wallet = await arweave.wallets.generate();
    walletAddress = await arweave.wallets.jwkToAddress(wallet);

    contractSrc = fs.readFileSync(path.join(__dirname, 'data/very-complicated-contract.js'), 'utf8');

    // deploying contract using the new SDK.
    const contractTxId = await smartweave.createContract.deploy({
      wallet,
      initState: JSON.stringify({}),
      src: contractSrc
    });

    contract = smartweave.contract(contractTxId);
    contract.connect(wallet);

    await mine();
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should properly deploy contract with initial state', async () => {
    expect(await contract.readState()).not.toBeUndefined();
  });
});

async function mine() {
  await arweave.api.get('mine');
}
