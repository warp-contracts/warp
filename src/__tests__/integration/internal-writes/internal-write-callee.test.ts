/* eslint-disable */
import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, LoggerFactory, Warp, WarpFactory } from '@warp';
import path from 'path';
import { mineBlock } from '../_helpers';

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
  let warp: Warp;
  let calleeContract: Contract<ExampleContractState>;
  let calleeContractVM: Contract<ExampleContractState>;
  let callingContract: Contract;
  let callingContractVM: Contract;
  let calleeTxId;
  let callingTxId;

  const port = 1910;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(port, false);
    await arlocal.start();
    LoggerFactory.INST.logLevel('error');
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  async function deployContracts() {
    warp = WarpFactory.forLocal(port);
    wallet = await warp.testing.generateWallet();

    callingContractSrc = fs.readFileSync(path.join(__dirname, '../data/writing-contract.js'), 'utf8');
    callingContractInitialState = fs.readFileSync(path.join(__dirname, '../data/writing-contract-state.json'), 'utf8');
    calleeContractSrc = fs.readFileSync(path.join(__dirname, '../data/example-contract.js'), 'utf8');
    calleeInitialState = fs.readFileSync(path.join(__dirname, '../data/example-contract-state.json'), 'utf8');

    ({ contractTxId: calleeTxId } = await warp.createContract.deploy({
      wallet,
      initState: calleeInitialState,
      src: calleeContractSrc
    }));

    ({ contractTxId: callingTxId } = await warp.createContract.deploy({
      wallet,
      initState: callingContractInitialState,
      src: callingContractSrc
    }));

    calleeContract = warp
      .contract<ExampleContractState>(calleeTxId)
      .setEvaluationOptions({
        internalWrites: true,
        mineArLocalBlocks: false
      })
      .connect(wallet);
    calleeContractVM = warp
      .contract<ExampleContractState>(calleeTxId)
      .setEvaluationOptions({
        internalWrites: true,
        useVM2: true,
        mineArLocalBlocks: false
      })
      .connect(wallet);

    callingContract = warp
      .contract(callingTxId)
      .setEvaluationOptions({
        internalWrites: true,
        mineArLocalBlocks: false
      })
      .connect(wallet);
    callingContractVM = warp
      .contract(callingTxId)
      .setEvaluationOptions({
        internalWrites: true,
        useVM2: true,
        mineArLocalBlocks: false
      })
      .connect(wallet);

    await mineBlock(warp);
  }

  describe('with read states in between', () => {
    beforeAll(async () => {
      await deployContracts();
    });

    it('should deploy callee contract with initial state', async () => {
      expect((await calleeContract.readState()).state.counter).toEqual(555);
    });

    it('should write direct interactions', async () => {
      await calleeContract.writeInteraction({ function: 'add' });
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);
      expect((await calleeContract.readState()).state.counter).toEqual(557);
      expect((await calleeContractVM.readState()).state.counter).toEqual(557);
    });

    it('should write one direct and one internal interaction', async () => {
      await calleeContract.writeInteraction({ function: 'add' });
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(warp);
      expect((await calleeContract.readState()).state.counter).toEqual(568);
      expect((await calleeContractVM.readState()).state.counter).toEqual(568);
    });

    it('should write another direct interaction', async () => {
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);
      expect((await calleeContract.readState()).state.counter).toEqual(569);
      expect((await calleeContractVM.readState()).state.counter).toEqual(569);
    });

    it('should write double internal interaction with direct interaction', async () => {
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(warp);
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);
      expect((await calleeContract.readState()).state.counter).toEqual(590);
      expect((await calleeContractVM.readState()).state.counter).toEqual(590);
    });

    it('should write combination of internal and direct interaction', async () => {
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(warp);
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);
      expect((await calleeContract.readState()).state.counter).toEqual(601);
      expect((await calleeContractVM.readState()).state.counter).toEqual(601);
    });

    it('should write combination of internal and direct interaction', async () => {
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(warp);
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);
      expect((await calleeContract.readState()).state.counter).toEqual(612);
      expect((await calleeContractVM.readState()).state.counter).toEqual(612);
    });

    it('should write combination of direct and internal interaction - at one block', async () => {
      await calleeContract.writeInteraction({ function: 'add' });
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(warp);
      expect((await calleeContract.readState()).state.counter).toEqual(623);
      expect((await calleeContractVM.readState()).state.counter).toEqual(623);
    });

    it('should write combination of direct and internal interaction - on different blocks', async () => {
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(warp);
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);
      expect((await calleeContract.readState()).state.counter).toEqual(634);
      expect((await calleeContractVM.readState()).state.counter).toEqual(634);
    });

    it('should properly evaluate state again', async () => {
      expect((await calleeContract.readState()).state.counter).toEqual(634);
      expect((await calleeContractVM.readState()).state.counter).toEqual(634);
    });
  });

  describe('with read state at the end', () => {
    beforeAll(async () => {
      await deployContracts();
    });

    it('should properly write a combination of direct and internal interactions', async () => {
      await calleeContract.writeInteraction({ function: 'add' });
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);

      await calleeContract.writeInteraction({ function: 'add' });
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(warp);

      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);

      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(warp);
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);

      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(warp);
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);

      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(warp);
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);

      await calleeContract.writeInteraction({ function: 'add' });
      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(warp);

      await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
      await mineBlock(warp);
      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);

      expect((await calleeContract.readState()).state.counter).toEqual(634);
      expect((await calleeContractVM.readState()).state.counter).toEqual(634);
    });

    it('should properly evaluate state again', async () => {
      expect((await calleeContract.readState()).state.counter).toEqual(634);
      expect((await calleeContractVM.readState()).state.counter).toEqual(634);
    });

    it('should properly evaluate state again with a new client', async () => {
      const calleeContract2 = WarpFactory.forLocal(port)
        .contract<ExampleContractState>(calleeTxId)
        .setEvaluationOptions({
          internalWrites: true
        });
      const calleeContract2VM = WarpFactory.forLocal(port)
        .contract<ExampleContractState>(calleeTxId)
        .setEvaluationOptions({
          internalWrites: true,
          useVM2: true
        });
      expect((await calleeContract2.readState()).state.counter).toEqual(634);
      expect((await calleeContract2VM.readState()).state.counter).toEqual(634);
    });
  });
});
