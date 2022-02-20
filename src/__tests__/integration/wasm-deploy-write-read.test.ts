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
    LoggerFactory.INST.logLevel('debug', 'WASM');

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

    contract = smartweave.contract<ExampleContractState>(contractTxId).setEvaluationOptions({
      gasLimit: 12000000
    });
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

  it('should properly register interactions', async () => {
    for (let i = 0; i < 100; i++) {
      await contract.writeInteraction({ function: 'increment' });
    }
  });

  it('should properly read state after adding interactions', async () => {
    await mineBlock(arweave);

    expect((await contract.readState()).state.counter).toEqual(100);
  });

  it('should properly view contract state', async () => {
    const interactionResult = await contract.viewState<unknown, any>({ function: 'fullName' });

    expect(interactionResult.result.fullName).toEqual('first_ppe last_ppe');
  });

  it('should measure gas during dryWrite', async () => {
    const result = await contract.dryWrite({
      function: 'increment'
    });

    expect(result.gasUsed).toEqual(11090335);
  });

  it('should return stable gas results', async () => {
    const results = [];

    for (let i = 0; i < 10; i++) {
      results.push(
        await contract.dryWrite({
          function: 'increment'
        })
      );
    }

    results.forEach((result) => {
      expect(result.gasUsed).toEqual(11090335);
    });
  });

  it('should return exception for inf. loop function for dry run', async () => {
    const result = await contract.dryWrite({
      function: 'infLoop'
    });

    expect(result.type).toEqual("exception");
    expect(result.errorMessage.startsWith("[RE:OOG")).toBeTruthy();
  });

  /*it('should skip interaction during contract state read if gas limit exceeded', async () => {
    const txId = await contract.writeInteraction({ function: 'infLoop' });
    await mineBlock(arweave);

    const result = await contract.readState();

    expect(result.validity[txId]).toBeFalsy();

    const callStack = contract.getCallStack();
    callStack.getInteraction(txId);

    expect(callStack.getInteraction(txId)).toEqual({});
  });*/


});
