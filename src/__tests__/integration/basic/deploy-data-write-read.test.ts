import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, LoggerFactory, Warp, WarpNodeFactory } from '@warp';
import path from 'path';
import { addFunds, mineBlock } from '../_helpers';

interface ExampleContractState {
  counter: number;
}

/**
 * This integration test should verify whether the basic functions of the Warp client
 * work properly.
 * It first deploys the new contract and verifies its initial state.
 * Then it subsequently creates new interactions - to verify, whether
 * the default caching mechanism (ie. interactions cache, state cache, etc).
 * work properly (ie. they do download the not yet cached interactions and evaluate state
 * for them).
 */
describe('Testing the Warp client', () => {
  let contractSrc: string;
  let initialState: string;

  let wallet: JWKInterface;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let warp: Warp;
  let contract: Contract<ExampleContractState>;
  let contractVM: Contract<ExampleContractState>;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1840, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1840,
      protocol: 'http'
    });

    LoggerFactory.INST.logLevel('error');

    warp = WarpNodeFactory.forTesting(arweave);

    wallet = await arweave.wallets.generate();
    await addFunds(arweave, wallet);

    contractSrc = fs.readFileSync(path.join(__dirname, '../data/example-contract.js'), 'utf8');
    initialState = fs.readFileSync(path.join(__dirname, '../data/example-contract-state.json'), 'utf8');

    // deploying contract using the new SDK.
    const contractTxId = await warp.createContract.deploy({
      wallet,
      initState: initialState,
      data: { 'Content-Type': 'text/html', body: '<h1>HELLO WORLD</h1>' },
      src: contractSrc
    });

    contract = warp.contract(contractTxId);
    contractVM = warp.contract<ExampleContractState>(contractTxId).setEvaluationOptions({
      useVM2: true
    });
    contract.connect(wallet);
    contractVM.connect(wallet);

    await mineBlock(arweave);
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should properly deploy contract with initial state', async () => {
    expect((await contract.readState()).state.counter).toEqual(555);
    expect((await contractVM.readState()).state.counter).toEqual(555);
  });

  it('should properly add new interaction', async () => {
    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);

    expect((await contract.readState()).state.counter).toEqual(556);
    expect((await contractVM.readState()).state.counter).toEqual(556);
  });

  it('should properly add another interactions', async () => {
    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);

    expect((await contract.readState()).state.counter).toEqual(559);
    expect((await contractVM.readState()).state.counter).toEqual(559);
  });

  it('should properly view contract state', async () => {
    const interactionResult = await contract.viewState<unknown, number>({ function: 'value' });
    const interactionResultVM = await contractVM.viewState<unknown, number>({ function: 'value' });
    expect(interactionResult.result).toEqual(559);
    expect(interactionResultVM.result).toEqual(559);
  });
});
