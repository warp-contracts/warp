/* eslint-disable */
import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import {
  CacheableStateEvaluator,
  Contract,
  defaultCacheOptions,
  LoggerFactory,
  SmartWeave,
  SmartWeaveFactory
} from '@smartweave';
import path from 'path';
import { addFunds, mineBlock } from '../_helpers';

interface ExampleContractState {
  counter: number;
}

/**
 * The most basic example of writes between contracts.
 * In this suite "User" is calling CallingContract.writeContract
 * (which calls CalleContract.addAmount and in effect - changes its state)
 * or "User" is calling CalleeContract.add() directly.
 *
 * Multiple combinations of both calls (with mining happening on different stages)
 * are being tested.
 *
 *         ┌──────┐
 * ┌───┬───┤ User │
 * │   │   └──────┘
 * │   │   ┌─────────────────────────────────┐
 * │   │   │CallingContract                  │
 * │   │   ├─────────────────────────────────┤
 * │   └──►│writeContract(contractId, amount)├───┐
 * │       └─────────────────────────────────┘   │
 * │   ┌─────────────────────────────────────────┘
 * │   │   ┌─────────────────────────────────┐
 * │   │   │CalleeContract                   │
 * │   │   ├─────────────────────────────────┤
 * │   └──►│addAmount(amount)                │
 * └──────►│add()                            │
 *         └─────────────────────────────────┘
 */

describe('Testing internal writes', () => {
  let callingContractSrc: string;
  let callingContractInitialState: string;
  let calleeContractSrc: string;
  let calleeInitialState: string;

  let wallet: JWKInterface;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let smartweave: SmartWeave;
  let calleeContract: Contract<ExampleContractState>;
  let calleeContractVM: Contract<ExampleContractState>;
  let callingContract: Contract;
  let callingContractVM: Contract;
  let calleeTxId;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1910, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1910,
      protocol: 'http'
    });

    LoggerFactory.INST.logLevel('fatal');
    LoggerFactory.INST.logLevel('debug', 'DefaultStateEvaluator');
    // LoggerFactory.INST.logLevel('debug', 'CacheableStateEvaluator');
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  async function deployContracts(cacheDir: string) {
    smartweave = SmartWeaveFactory.arweaveGw(arweave, {
      ...defaultCacheOptions,
      dbLocation: cacheDir
    });

    wallet = await arweave.wallets.generate();
    await addFunds(arweave, wallet);

    callingContractSrc = fs.readFileSync(path.join(__dirname, '../data/writing-contract.js'), 'utf8');
    callingContractInitialState = fs.readFileSync(path.join(__dirname, '../data/writing-contract-state.json'), 'utf8');
    calleeContractSrc = fs.readFileSync(path.join(__dirname, '../data/example-contract.js'), 'utf8');
    calleeInitialState = fs.readFileSync(path.join(__dirname, '../data/example-contract-state.json'), 'utf8');

    calleeTxId = await smartweave.createContract.deploy({
      wallet,
      initState: calleeInitialState,
      src: calleeContractSrc
    });

    const callingTxId = await smartweave.createContract.deploy({
      wallet,
      initState: callingContractInitialState,
      src: callingContractSrc
    });

    calleeContract = smartweave
      .contract<ExampleContractState>(calleeTxId)
      .setEvaluationOptions({
        internalWrites: true
      })
      .connect(wallet);
    calleeContractVM = smartweave
      .contract<ExampleContractState>(calleeTxId)
      .setEvaluationOptions({
        internalWrites: true,
        useVM2: true
      })
      .connect(wallet);

    callingContract = smartweave
      .contract(callingTxId)
      .setEvaluationOptions({
        internalWrites: true
      })
      .connect(wallet);
    callingContractVM = smartweave
      .contract(callingTxId)
      .setEvaluationOptions({
        internalWrites: true,
        useVM2: true
      })
      .connect(wallet);

    await mineBlock(arweave);
  }

  describe('with read states in between', () => {
    const cacheDir = `./cache/iw/ce1/warp/`;

    beforeAll(async () => {
      await deployContracts(cacheDir);
    });

    afterAll(async () => {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    });

    it('should deploy callee contract with initial state', async () => {
      expect((await calleeContract.readState()).state.counter).toEqual(555);
    });

    it('should write direct interactions', async () => {
      await calleeContract.writeInteraction({ function: 'add' });
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(arweave);

      expect((await calleeContract.readState()).state.counter).toEqual(557);
      expect((await calleeContractVM.readState()).state.counter).toEqual(557);
    });

    it('should write one direct and one internal interaction', async () => {
      await calleeContract.writeInteraction({ function: 'add' });
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(arweave);
      expect((await calleeContract.readState()).state.counter).toEqual(568);
      expect((await calleeContractVM.readState()).state.counter).toEqual(568);
    });

    it('should write another direct interaction', async () => {
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(arweave);
      expect((await calleeContract.readState()).state.counter).toEqual(569);
      expect((await calleeContractVM.readState()).state.counter).toEqual(569);
    });

    it('should write double internal interaction with direct interaction', async () => {
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(arweave);
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(arweave);
      expect((await calleeContract.readState()).state.counter).toEqual(590);
      expect((await calleeContractVM.readState()).state.counter).toEqual(590);
    });

    it('should write combination of internal and direct interaction', async () => {
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(arweave);
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(arweave);
      expect((await calleeContract.readState()).state.counter).toEqual(601);
      expect((await calleeContractVM.readState()).state.counter).toEqual(601);
    });

    it('should write combination of internal and direct interaction', async () => {
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(arweave);
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(arweave);
      expect((await calleeContract.readState()).state.counter).toEqual(612);
      expect((await calleeContractVM.readState()).state.counter).toEqual(612);
    });

    it('should write combination of direct and internal interaction - at one block', async () => {
      await calleeContract.writeInteraction({ function: 'add' });
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(arweave);
      expect((await calleeContract.readState()).state.counter).toEqual(623);
      expect((await calleeContractVM.readState()).state.counter).toEqual(623);
    });

    it('should write combination of direct and internal interaction - on different blocks', async () => {
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(arweave);
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(arweave);
      expect((await calleeContract.readState()).state.counter).toEqual(634);
      expect((await calleeContractVM.readState()).state.counter).toEqual(634);
    });

    it('should properly evaluate state again', async () => {
      expect((await calleeContract.readState()).state.counter).toEqual(634);
      expect((await calleeContractVM.readState()).state.counter).toEqual(634);
    });
  });

  fdescribe('with read state at the end', () => {
    const cacheDir = `./cache/iw/ce2/warp/`;

    beforeAll(async () => {
      await deployContracts(cacheDir);
    });

    afterAll(async () => {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    });

    it('should properly write a combination of direct and internal interactions', async () => {
      await calleeContract.writeInteraction({ function: 'add' });
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(arweave);

      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(arweave);

      expect((await calleeContract.readState()).state.counter).toEqual(21);

      /*await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(arweave);

      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(arweave);
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(arweave);*/

      /*expect((await calleeContract.readState()).state.counter).toEqual(590);
      expect((await calleeContractVM.readState()).state.counter).toEqual(590)*/

      /* await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
       await mineBlock(arweave);
       await calleeContract.writeInteraction({ function: 'add' });
       await mineBlock(arweave);

       await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
       await mineBlock(arweave);
       await calleeContract.writeInteraction({ function: 'add' });
       await mineBlock(arweave);

       await calleeContract.writeInteraction({ function: 'add' });
       await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
       await mineBlock(arweave);

       /!*expect((await calleeContract.readState()).state.counter).toEqual(623);
       expect((await calleeContractVM.readState()).state.counter).toEqual(623)*!/

       await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
       await mineBlock(arweave);
       await calleeContract.writeInteraction({ function: 'add' });
       await mineBlock(arweave);
       expect((await calleeContract.readState()).state.counter).toEqual(634);*/
      //expect((await calleeContractVM.readState()).state.counter).toEqual(634);
    });

    xit('should properly evaluate state again', async () => {
      expect((await calleeContract.readState()).state.counter).toEqual(634);
      expect((await calleeContractVM.readState()).state.counter).toEqual(634);
    });

    xit('should properly evaluate state again with a new client', async () => {
      const cacheDir = `./cache/iw/ce3/warp/`;
      const cacheDirVm = `./cache/iw/ce4/warp/`;

      try {
        const calleeContract2 = SmartWeaveFactory.arweaveGw(arweave, {
          ...defaultCacheOptions,
          dbLocation: cacheDir
        })
          .contract<ExampleContractState>(calleeTxId)
          .setEvaluationOptions({
            internalWrites: true
          });
        const calleeContract2VM = SmartWeaveFactory.arweaveGw(arweave, {
          ...defaultCacheOptions,
          dbLocation: cacheDirVm
        })
          .contract<ExampleContractState>(calleeTxId)
          .setEvaluationOptions({
            internalWrites: true,
            useVM2: true
          });
        expect((await calleeContract2.readState()).state.counter).toEqual(634);
        expect((await calleeContract2VM.readState()).state.counter).toEqual(634);
      } finally {
        fs.rmSync(cacheDir, { recursive: true, force: true });
        fs.rmSync(cacheDirVm, { recursive: true, force: true });
      }
    });
  });
});
