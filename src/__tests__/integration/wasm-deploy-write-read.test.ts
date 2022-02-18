import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, LoggerFactory, SmartWeave, SmartWeaveNodeFactory } from '@smartweave';
import path from 'path';
import { addFunds, mineBlock } from './_helpers';

interface ExampleContractState {
  counter: number;
}

describe('Testing the SmartWeave client for WASM contract', () => {
  let contractSrc: Buffer;
  let initialState: string;
  let contractTxId: string;

  let wallet: JWKInterface;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let smartweave: SmartWeave;
  let contract: Contract<ExampleContractState>;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1300, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1300,
      protocol: 'http'
    });

    LoggerFactory.INST.logLevel('error');
    LoggerFactory.INST.logLevel('debug', 'WasmContractHandlerApi');

    smartweave = SmartWeaveNodeFactory.memCached(arweave);

    wallet = await arweave.wallets.generate();
    await addFunds(arweave, wallet);

    contractSrc = fs.readFileSync(path.join(__dirname, 'data/wasm/counter.wasm'));
    initialState = fs.readFileSync(path.join(__dirname, 'data/wasm/counter-init-state.json'), 'utf8');

    // deploying contract using the new SDK.
    contractTxId = await smartweave.createContract.deploy({
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
  });

  it('should properly deploy contract', async () => {
    const contractTx = await arweave.transactions.get(contractTxId);
    expect(contractTx).not.toBeNull();
  });

  it('should properly read initial state', async () => {
    expect((await contract.readState()).state.counter).toEqual(0);
  });

  it('should properly read state after adding interactions', async () => {
    await contract.writeInteraction({ function: 'increment' });
    await mineBlock(arweave);
    await contract.writeInteraction({ function: 'increment' });
    await mineBlock(arweave);
    await contract.writeInteraction({ function: 'increment' });
    await mineBlock(arweave);

    expect((await contract.readState()).state.counter).toEqual(3);
  });

  it('should properly view contract state', async () => {
    const interactionResult = await contract.viewState<unknown, any>({ function: 'fullName' });

    expect(interactionResult.result.fullName).toEqual("first_ppe last_ppe");
  });
});
