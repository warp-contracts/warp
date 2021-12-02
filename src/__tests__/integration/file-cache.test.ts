import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, LoggerFactory, SmartWeave, SmartWeaveNodeFactory } from '@smartweave';
import path from 'path';
import { TsLogFactory } from '../../logging/node/TsLogFactory';
import { addFunds, mineBlock } from './_helpers';

interface ExampleContractState {
  counter: number;
}

/**
 * This integration test should verify whether the basic functions of the SmartWeave client
 * work properly when file-based cache is being used.
 */
describe('Testing the SmartWeave client', () => {
  let contractSrc: string;
  let initialState: string;

  let wallet: JWKInterface;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let smartweave: SmartWeave;
  let contract: Contract<ExampleContractState>;
  const cacheDir = path.join(__dirname, 'cache');

  beforeAll(async () => {
    removeCacheDir();
    fs.mkdirSync(cacheDir);
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1790, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1790,
      protocol: 'http'
    });

    LoggerFactory.INST.logLevel('error');

    smartweave = SmartWeaveNodeFactory.fileCached(arweave, cacheDir);

    wallet = await arweave.wallets.generate();
    await addFunds(arweave, wallet);

    contractSrc = fs.readFileSync(path.join(__dirname, 'data/example-contract.js'), 'utf8');
    initialState = fs.readFileSync(path.join(__dirname, 'data/example-contract-state.json'), 'utf8');

    // deploying contract using the new SDK.
    const contractTxId = await smartweave.createContract.deploy({
      wallet,
      initState: initialState,
      src: contractSrc
    });

    contract = smartweave.contract(contractTxId);
    contract.connect(wallet);

    await mineBlock(arweave);
  });

  afterAll(async () => {
    await arlocal.stop();
    removeCacheDir();
  });

  it('should properly deploy contract with initial state', async () => {
    expect((await contract.readState()).state.counter).toEqual(555);
  });

  it('should properly add new interaction', async () => {
    await contract.writeInteraction({ function: 'add' });

    await mineBlock(arweave);

    expect((await contract.readState()).state.counter).toEqual(556);
  });

  it('should properly add another interactions', async () => {
    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);

    expect((await contract.readState()).state.counter).toEqual(559);
  });

  it('should properly view contract state', async () => {
    const interactionResult = await contract.viewState<unknown, number>({ function: 'value' });
    expect(interactionResult.result).toEqual(559);
  });

  it('should properly read state with a fresh client', async () => {
    const contract2 = SmartWeaveNodeFactory.fileCached(arweave, cacheDir)
      .contract<ExampleContractState>(contract.txId())
      .connect(wallet);
    expect((await contract2.readState()).state.counter).toEqual(559);

    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    expect((await contract2.readState()).state.counter).toEqual(561);
  });

  it('should properly read state with another fresh client', async () => {
    const contract3 = SmartWeaveNodeFactory.fileCached(arweave, cacheDir)
      .contract<ExampleContractState>(contract.txId())
      .connect(wallet);
    expect((await contract3.readState()).state.counter).toEqual(561);

    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    expect((await contract3.readState()).state.counter).toEqual(563);
  });

  function removeCacheDir() {
    if (fs.existsSync(cacheDir)) {
      fs.rmdirSync(cacheDir, { recursive: true });
    }
  }
});
