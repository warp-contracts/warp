import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import path from 'path';
import { mineBlock } from '../_helpers';
import { Contract } from '../../../contract/Contract';
import { SmartWeaveTags } from '../../../core/SmartWeaveTags';
import { Warp } from '../../../core/Warp';
import { WarpFactory } from '../../../core/WarpFactory';
import { getTag } from '../../../legacy/utils';
import { LoggerFactory } from '../../../logging/LoggerFactory';

interface ExampleContractState {
  counter: number;
  firstName: string;
  lastName: string;
}

describe('Testing the Warp client for AssemblyScript WASM contract', () => {
  let contractSrc: Buffer;
  let initialState: string;
  let contractTxId: string;

  let wallet: JWKInterface;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let warp: Warp;
  let contract: Contract<ExampleContractState>;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1300, false);
    await arlocal.start();

    LoggerFactory.INST.logLevel('error');

    warp = WarpFactory.forLocal(1300);
    ({ arweave } = warp);

    ({ jwk: wallet } = await warp.testing.generateWallet())
    contractSrc = fs.readFileSync(path.join(__dirname, '../data/wasm/as/assemblyscript-counter.wasm'));
    initialState = fs.readFileSync(path.join(__dirname, '../data/wasm/counter-init-state.json'), 'utf8');

    // deploying contract using the new SDK.
    ({ contractTxId } = await warp.createContract.deploy({
      wallet,
      initState: initialState,
      src: contractSrc,
      wasmSrcCodeDir: path.join(__dirname, '../data/wasm/as/assembly')
    }));

    contract = warp.contract<ExampleContractState>(contractTxId).setEvaluationOptions({
      gasLimit: 1000000000,
      mineArLocalBlocks: false
    });
    contract.connect(wallet);

    await mineBlock(warp);
  }, 50000);

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should properly deploy contract', async () => {
    const contractTx = await arweave.transactions.get(contractTxId);

    expect(contractTx).not.toBeNull();

    const contractSrcTx = await arweave.transactions.get(getTag(contractTx, SmartWeaveTags.CONTRACT_SRC_TX_ID));
    expect(getTag(contractSrcTx, SmartWeaveTags.CONTENT_TYPE)).toEqual('application/wasm');
    expect(getTag(contractSrcTx, SmartWeaveTags.WASM_LANG)).toEqual('assemblyscript');
  });

  it('should properly read initial state', async () => {
    const contractState = (await contract.readState()).cachedValue.state;
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
    await mineBlock(warp);

    expect((await contract.readState()).cachedValue.state.counter).toEqual(100);
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
    expect(result.gasUsed).toBeLessThanOrEqual(20316175);
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
      expect(result.gasUsed).toBeLessThanOrEqual(20316175);
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
    await mineBlock(warp);

    const result = await contract.readState();

    expect(result.validity[txId]).toBeFalsy();

    const callStack = contract.getCallStack();
    callStack.getInteraction(txId);

    expect(callStack.getInteraction(txId)).toEqual({});
  });*/

  it("should properly evolve contract's source code", async () => {
    expect((await contract.readState()).cachedValue.state.counter).toEqual(100);

    const newContractSrc = fs.readFileSync(path.join(__dirname, '../data/wasm/as/assemblyscript-counter-evolve.wasm'));

    const newSrcTxId = await contract.save({
      src: newContractSrc,
      wasmSrcCodeDir: path.join(__dirname, '../data/wasm/as/assembly-evolve')
    });
    await mineBlock(warp);

    await contract.evolve(newSrcTxId);
    await mineBlock(warp);

    await contract.writeInteraction({
      function: 'increment'
    });
    await mineBlock(warp);

    // note: evolve should increment by 2 instead of 1
    expect((await contract.readState()).cachedValue.state.counter).toEqual(102);
  });
});
