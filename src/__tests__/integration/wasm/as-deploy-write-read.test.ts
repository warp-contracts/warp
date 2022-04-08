import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, getTag, LoggerFactory, SmartWeave, SmartWeaveNodeFactory, SmartWeaveTags } from '@smartweave';
import path from 'path';
import { addFunds, mineBlock } from '../_helpers';

interface ExampleContractState {
  counter: number;
  firstName: string;
  lastName: string;
}

describe('Testing the SmartWeave client for AssemblyScript WASM contract', () => {
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

    smartweave = SmartWeaveNodeFactory.memCached(arweave);

    wallet = await arweave.wallets.generate();
    await addFunds(arweave, wallet);

    contractSrc = fs.readFileSync(path.join(__dirname, '../data/wasm/as/assemblyscript-counter.wasm'));
    initialState = fs.readFileSync(path.join(__dirname, '../data/wasm/counter-init-state.json'), 'utf8');

    // deploying contract using the new SDK.
    contractTxId = await smartweave.createContract.deploy(
      {
        wallet,
        initState: initialState,
        src: contractSrc
      },
      path.join(__dirname, '../data/wasm/as/assembly')
    );

    contract = smartweave.contract<ExampleContractState>(contractTxId).setEvaluationOptions({
      gasLimit: 14000000
    });
    contract.connect(wallet);

    await mineBlock(arweave);
  }, 50000);

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should properly deploy contract', async () => {
    const contractTx = await arweave.transactions.get(contractTxId);

    console.log(contractTx.id);

    expect(contractTx).not.toBeNull();
    expect(getTag(contractTx, SmartWeaveTags.CONTRACT_TYPE)).toEqual('wasm');
    expect(getTag(contractTx, SmartWeaveTags.WASM_LANG)).toEqual('assemblyscript');

    const contractSrcTx = await arweave.transactions.get(getTag(contractTx, SmartWeaveTags.CONTRACT_SRC_TX_ID));
    expect(getTag(contractSrcTx, SmartWeaveTags.CONTENT_TYPE)).toEqual('application/wasm');
    expect(getTag(contractSrcTx, SmartWeaveTags.WASM_LANG)).toEqual('assemblyscript');
  });

  it('should properly read initial state', async () => {
    const contractState = (await contract.readState()).state;
    expect(contractState.counter).toEqual(0);
    expect(contractState.firstName).toEqual('first_ppe');
    expect(contractState.lastName).toEqual('last_ppe');
  });

  it('should properly register interactions', async () => {
    for (let i = 0; i < 100; i++) {
      await contract.writeInteraction({ function: 'increment' });
    }
  }, 10000);

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

    expect(result.gasUsed).toBeGreaterThanOrEqual(12200000);
    expect(result.gasUsed).toBeLessThanOrEqual(12410898);
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
      expect(result.gasUsed).toBeGreaterThanOrEqual(12200000);
      expect(result.gasUsed).toBeLessThanOrEqual(12410898);
    });
  });

  it('should return exception for inf. loop function for dry run', async () => {
    const result = await contract.dryWrite({
      function: 'infLoop'
    });

    expect(result.type).toEqual('exception');
    expect(result.errorMessage.startsWith('[RE:OOG')).toBeTruthy();
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
