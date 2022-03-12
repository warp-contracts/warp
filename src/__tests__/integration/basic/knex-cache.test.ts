import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, LoggerFactory, SmartWeave, SmartWeaveNodeFactory } from '@smartweave';
import path from 'path';
import { TsLogFactory } from '../../../logging/node/TsLogFactory';
import { addFunds, mineBlock } from '../_helpers';
import knex from 'knex';

interface ExampleContractState {
  counter: number;
}

/**
 * This integration test should verify whether the basic functions of the SmartWeave client
 * work properly when Knex cache is being used.
 */
describe('Testing the SmartWeave client', () => {
  let contractSrc: string;
  let initialState: string;

  let wallet: JWKInterface;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let smartweave: SmartWeave;
  let contract_1: Contract<ExampleContractState>;
  let contract_2: Contract<ExampleContractState>;

  const cacheDir = path.join(__dirname, 'db');

  const knexConfig = knex({
    client: 'sqlite3',
    connection: {
      filename: `${cacheDir}/db.sqlite`
    },
    useNullAsDefault: true
  });

  beforeAll(async () => {
    removeCacheDir();
    fs.mkdirSync(cacheDir);
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1780, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1780,
      protocol: 'http'
    });

    LoggerFactory.INST.logLevel('error');

    smartweave = await SmartWeaveNodeFactory.knexCached(arweave, knexConfig);

    wallet = await arweave.wallets.generate();
    await addFunds(arweave, wallet);

    contractSrc = fs.readFileSync(path.join(__dirname, '../data/example-contract.js'), 'utf8');
    initialState = fs.readFileSync(path.join(__dirname, '../data/example-contract-state.json'), 'utf8');

    // deploying contract using the new SDK.
    const contractTxId1 = await smartweave.createContract.deploy({
      wallet,
      initState: initialState,
      src: contractSrc
    });

    const contractTxId2 = await smartweave.createContract.deploy({
      wallet,
      initState: '{"counter": 100}',
      src: contractSrc
    });

    contract_1 = smartweave.contract<ExampleContractState>(contractTxId1).connect(wallet);
    contract_2 = smartweave.contract<ExampleContractState>(contractTxId2).connect(wallet);

    await mineBlock(arweave);
  });

  afterAll(async () => {
    await arlocal.stop();
    await knexConfig.destroy();
    removeCacheDir();
  });

  it('should properly deploy contract with initial state', async () => {
    expect((await contract_1.readState()).state.counter).toEqual(555);
    expect((await contract_2.readState()).state.counter).toEqual(100);
  });

  it('should properly add new interaction', async () => {
    await contract_1.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });

    await mineBlock(arweave);

    expect((await contract_1.readState()).state.counter).toEqual(556);
    expect((await contract_2.readState()).state.counter).toEqual(102);
  });

  it('should properly add another interactions', async () => {
    await contract_1.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract_1.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract_1.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });
    await mineBlock(arweave);

    expect((await contract_1.readState()).state.counter).toEqual(559);
    expect((await contract_2.readState()).state.counter).toEqual(105);
  });

  it('should properly view contract state', async () => {
    const interactionResult = await contract_1.viewState<unknown, number>({ function: 'value' });
    expect(interactionResult.result).toEqual(559);

    const interactionResult2 = await contract_2.viewState<unknown, number>({ function: 'value' });
    expect(interactionResult2.result).toEqual(105);
  });

  it('should properly read state with a fresh client', async () => {
    const contract_1_2 = (await SmartWeaveNodeFactory.knexCached(arweave, knexConfig))
      .contract<ExampleContractState>(contract_1.txId())
      .connect(wallet);
    expect((await contract_1_2.readState()).state.counter).toEqual(559);

    const contract_2_2 = (await SmartWeaveNodeFactory.knexCached(arweave, knexConfig))
      .contract<ExampleContractState>(contract_2.txId())
      .connect(wallet);
    expect((await contract_2_2.readState()).state.counter).toEqual(105);

    await contract_1.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract_1.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    expect((await contract_1_2.readState()).state.counter).toEqual(561);
    expect((await contract_2_2.readState()).state.counter).toEqual(107);
  });

  it('should properly read state with another fresh client', async () => {
    const contract_1_3 = (await SmartWeaveNodeFactory.knexCached(arweave, knexConfig))
      .contract<ExampleContractState>(contract_1.txId())
      .connect(wallet);
    const contract_2_3 = (await SmartWeaveNodeFactory.knexCached(arweave, knexConfig))
      .contract<ExampleContractState>(contract_2.txId())
      .connect(wallet);
    expect((await contract_1_3.readState()).state.counter).toEqual(561);
    expect((await contract_2_3.readState()).state.counter).toEqual(107);

    await contract_1.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract_1.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    expect((await contract_1_3.readState()).state.counter).toEqual(563);
    expect((await contract_2_3.readState()).state.counter).toEqual(109);
  });

  it('should properly eval state for missing interactions', async () => {
    await contract_1.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract_1.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });
    await mineBlock(arweave);

    const contract_1_4 = (await SmartWeaveNodeFactory.knexCached(arweave, knexConfig))
      .contract<ExampleContractState>(contract_1.txId())
      .connect(wallet);
    const contract_2_4 = (await SmartWeaveNodeFactory.knexCached(arweave, knexConfig))
      .contract<ExampleContractState>(contract_2.txId())
      .connect(wallet);
    expect((await contract_1.readState()).state.counter).toEqual(565);
    expect((await contract_1_4.readState()).state.counter).toEqual(565);
    expect((await contract_2.readState()).state.counter).toEqual(111);
    expect((await contract_2_4.readState()).state.counter).toEqual(111);
  });

  function removeCacheDir() {
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true });
    }
  }
});
