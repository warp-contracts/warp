import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, LoggerFactory, Warp, WarpNodeFactory } from '@warp';
import path from 'path';
import { addFunds, mineBlock } from '../_helpers';
import knex, { Knex } from 'knex';

interface ExampleContractState {
  counter: number;
}

async function getWarp(arweave: Arweave, knexConfig: Knex<any, unknown[]>) {
  return (await WarpNodeFactory.knexCachedBased(arweave, knexConfig)).useArweaveGateway().build();
}

/**
 * This integration test should verify whether the basic functions of the Warp client
 * work properly when Knex cache is being used.
 */
describe('Testing the Warp client', () => {
  let contractSrc: string;
  let initialState: string;

  let wallet: JWKInterface;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let warp: Warp;
  let contract_1: Contract<ExampleContractState>;
  let contract_1VM: Contract<ExampleContractState>;
  let contract_2: Contract<ExampleContractState>;
  let contract_2VM: Contract<ExampleContractState>;

  const cacheDir = path.join(__dirname, 'db');

  const knexConfig = knex({
    client: 'sqlite3',
    connection: {
      filename: `${cacheDir}/db.sqlite`
    },
    useNullAsDefault: true
  });

  const knexConfig2 = knex({
    client: 'sqlite3',
    connection: {
      filename: `${cacheDir}/db-manual.sqlite`
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

    warp = await getWarp(arweave, knexConfig);

    wallet = await arweave.wallets.generate();
    await addFunds(arweave, wallet);

    contractSrc = fs.readFileSync(path.join(__dirname, '../data/example-contract.js'), 'utf8');
    initialState = fs.readFileSync(path.join(__dirname, '../data/example-contract-state.json'), 'utf8');

    // deploying contract using the new SDK.
    const contractTxId1 = await warp.createContract.deploy({
      wallet,
      initState: initialState,
      src: contractSrc
    });

    const contractTxId2 = await warp.createContract.deploy({
      wallet,
      initState: '{"counter": 100}',
      src: contractSrc
    });

    contract_1 = warp.contract<ExampleContractState>(contractTxId1).connect(wallet);
    contract_1VM = warp
      .contract<ExampleContractState>(contractTxId1)
      .setEvaluationOptions({ useVM2: true })
      .connect(wallet);
    contract_2 = warp.contract<ExampleContractState>(contractTxId2).connect(wallet);
    contract_2VM = warp
      .contract<ExampleContractState>(contractTxId2)
      .setEvaluationOptions({ useVM2: true })
      .connect(wallet);

    await mineBlock(arweave);
  });

  afterAll(async () => {
    await arlocal.stop();
    await knexConfig.destroy();
    await knexConfig2.destroy();
    removeCacheDir();
  });

  it('should properly deploy contract with initial state', async () => {
    expect((await contract_1.readState()).state.counter).toEqual(555);
    expect((await contract_1VM.readState()).state.counter).toEqual(555);
    expect((await contract_2.readState()).state.counter).toEqual(100);
    expect((await contract_2VM.readState()).state.counter).toEqual(100);
  });

  it('should properly add new interaction', async () => {
    await contract_1.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });

    await mineBlock(arweave);

    expect((await contract_1.readState()).state.counter).toEqual(556);
    expect((await contract_1VM.readState()).state.counter).toEqual(556);
    expect((await contract_2.readState()).state.counter).toEqual(102);
    expect((await contract_2VM.readState()).state.counter).toEqual(102);
    expect(await cachedStates(knexConfig)).toEqual(2);
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
    expect((await contract_1VM.readState()).state.counter).toEqual(559);
    expect((await contract_2.readState()).state.counter).toEqual(105);
    expect((await contract_2VM.readState()).state.counter).toEqual(105);
    expect(await cachedStates(knexConfig)).toEqual(4);
  });

  it('should properly view contract state', async () => {
    const interactionResult = await contract_1.viewState<unknown, number>({ function: 'value' });
    const interactionResultVM = await contract_1VM.viewState<unknown, number>({ function: 'value' });
    expect(interactionResultVM.result).toEqual(559);

    const interactionResult2 = await contract_2.viewState<unknown, number>({ function: 'value' });
    const interactionResult2VM = await contract_2.viewState<unknown, number>({ function: 'value' });
    expect(interactionResult2VM.result).toEqual(105);

    expect(await cachedStates(knexConfig)).toEqual(4);
  });

  it('should properly read state with a fresh client', async () => {
    const contract_1_2 = (await getWarp(arweave, knexConfig))
      .contract<ExampleContractState>(contract_1.txId())
      .connect(wallet);
    const contract_1_2VM = (await getWarp(arweave, knexConfig))
      .contract<ExampleContractState>(contract_1.txId())
      .setEvaluationOptions({ useVM2: true })
      .connect(wallet);
    expect((await contract_1_2.readState()).state.counter).toEqual(559);
    expect((await contract_1_2VM.readState()).state.counter).toEqual(559);

    const contract_2_2 = (await getWarp(arweave, knexConfig))
      .contract<ExampleContractState>(contract_2.txId())
      .connect(wallet);
    const contract_2_2VM = (await getWarp(arweave, knexConfig))
      .contract<ExampleContractState>(contract_2.txId())
      .setEvaluationOptions({ useVM2: true })
      .connect(wallet);
    expect((await contract_2_2.readState()).state.counter).toEqual(105);
    expect((await contract_2_2VM.readState()).state.counter).toEqual(105);

    await contract_1.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract_1.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    expect((await contract_1_2.readState()).state.counter).toEqual(561);
    expect((await contract_1_2VM.readState()).state.counter).toEqual(561);
    expect((await contract_2_2.readState()).state.counter).toEqual(107);
    expect((await contract_2_2VM.readState()).state.counter).toEqual(107);
    expect(await cachedStates(knexConfig)).toEqual(6);
  });

  it('should properly read state with another fresh client', async () => {
    const contract_1_3 = (await getWarp(arweave, knexConfig))
      .contract<ExampleContractState>(contract_1.txId())
      .connect(wallet);
    const contract_1_3VM = (await getWarp(arweave, knexConfig))
      .contract<ExampleContractState>(contract_1.txId())
      .setEvaluationOptions({ useVM2: true })
      .connect(wallet);
    const contract_2_3 = (await getWarp(arweave, knexConfig))
      .contract<ExampleContractState>(contract_2.txId())
      .connect(wallet);
    const contract_2_3VM = (await getWarp(arweave, knexConfig))
      .contract<ExampleContractState>(contract_2.txId())
      .setEvaluationOptions({ useVM2: true })
      .connect(wallet);
    expect((await contract_1_3.readState()).state.counter).toEqual(561);
    expect((await contract_1_3VM.readState()).state.counter).toEqual(561);
    expect((await contract_2_3.readState()).state.counter).toEqual(107);
    expect((await contract_2_3VM.readState()).state.counter).toEqual(107);
    expect(await cachedStates(knexConfig)).toEqual(6);

    await contract_1.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract_1.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    expect((await contract_1_3.readState()).state.counter).toEqual(563);
    expect((await contract_1_3VM.readState()).state.counter).toEqual(563);
    expect((await contract_2_3.readState()).state.counter).toEqual(109);
    expect((await contract_2_3VM.readState()).state.counter).toEqual(109);
    expect(await cachedStates(knexConfig)).toEqual(8);
  });

  it('should properly eval state for missing interactions', async () => {
    await contract_1.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract_1.writeInteraction({ function: 'add' });
    await contract_2.writeInteraction({ function: 'add' });
    await mineBlock(arweave);

    const contract_1_4 = (await getWarp(arweave, knexConfig))
      .contract<ExampleContractState>(contract_1.txId())
      .connect(wallet);
    const contract_1_4VM = (await getWarp(arweave, knexConfig))
      .contract<ExampleContractState>(contract_1.txId())
      .setEvaluationOptions({ useVM2: true })
      .connect(wallet);
    const contract_2_4 = (await getWarp(arweave, knexConfig))
      .contract<ExampleContractState>(contract_2.txId())
      .connect(wallet);
    const contract_2_4VM = (await getWarp(arweave, knexConfig))
      .contract<ExampleContractState>(contract_2.txId())
      .setEvaluationOptions({ useVM2: true })
      .connect(wallet);
    expect((await contract_1.readState()).state.counter).toEqual(565);
    expect((await contract_1VM.readState()).state.counter).toEqual(565);
    expect((await contract_1_4.readState()).state.counter).toEqual(565);
    expect((await contract_1_4VM.readState()).state.counter).toEqual(565);
    expect((await contract_2.readState()).state.counter).toEqual(111);
    expect((await contract_2VM.readState()).state.counter).toEqual(111);
    expect((await contract_2_4.readState()).state.counter).toEqual(111);
    expect((await contract_2_4VM.readState()).state.counter).toEqual(111);
    expect(await cachedStates(knexConfig)).toEqual(10);
  });

  it('should allow to manually flush cache', async () => {
    const warp = await getWarp(arweave, knexConfig2);

    const contract = warp
      .contract<ExampleContractState>(contract_1.txId())
      .setEvaluationOptions({
        manualCacheFlush: true
      })
      .connect(wallet);
    const contractVM = warp
      .contract<ExampleContractState>(contract_1.txId())
      .setEvaluationOptions({
        useVM2: true,
        manualCacheFlush: true
      })
      .connect(wallet);

    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);

    expect((await contract.readState()).state.counter).toEqual(568);
    expect((await contractVM.readState()).state.counter).toEqual(568);
    expect(await cachedStates(knexConfig2)).toEqual(0);
    await warp.flushCache();
    expect(await cachedStates(knexConfig2)).toEqual(1);

    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    expect((await contract.readState()).state.counter).toEqual(571);
    expect((await contractVM.readState()).state.counter).toEqual(571);
    expect(await cachedStates(knexConfig2)).toEqual(1);

    await warp.flushCache();
    expect(await cachedStates(knexConfig2)).toEqual(2);
  });

  async function cachedStates(db: Knex): Promise<number> {
    const result = await db.raw('select count(*) as cached from states');
    return result[0].cached;
  }

  function removeCacheDir() {
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true });
    }
  }
});
