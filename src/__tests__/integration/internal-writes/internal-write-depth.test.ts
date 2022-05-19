/* eslint-disable */
import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, LoggerFactory, Warp, WarpNodeFactory } from '@warp';
import path from 'path';
import { TsLogFactory } from '../../../logging/node/TsLogFactory';
import { addFunds, mineBlock } from '../_helpers';

/**
 * This test verifies "deep" writes between
 * contracts.
 *
 * 1. "User" calls ContractA.writeInDepth()
 * 2. Contract.writeInDepth() calls ContractB.addAmountDepth()
 * 3. ContractB.addAmountDepth(amount) increases its internal counter
 * by "amount" and calls ContractC.addAmount(amount + 20)
 * 4. ContractC.addAmount(amount) increases its internal counter
 * by amount.
 *
 * Multiple scenarios are tested separately (eg. with state read only on the
 * "deepest" contract).
 *
 *      ┌──────┐
 * ┌────┤ User │
 * │    └──────┘
 * │    ┌────────────────┐
 * │    │ContractA       │
 * │    ├────────────────┤
 * └───►│writeInDepth(   ├──────┐
 *      │ contractId1,   │      │
 *      │ contractId2,   │      │
 *      │ amount)        │      │
 *      └────────────────┘      │
 *    ┌─────────────────────────┘
 *    │      ┌────────────────┐
 *    │      │ContractB       │
 *    │      ├────────────────┤
 *    └─────►│addAmountDepth( ├─────┐
 *           │ contractId,    │     │
 *           │ amount)        │     │
 *           └────────────────┘     │
 *            ┌─────────────────────┘
 *            │    ┌─────────────┐
 *            │    │ContractC    │
 *            │    ├─────────────┤
 *            └───►│addAmount(   │
 *                 │ amount)     │
 *                 └─────────────┘
 */
describe('Testing internal writes', () => {
  let contractASrc: string;
  let contractAInitialState: string;
  let contractBSrc: string;
  let contractBInitialState: string;

  let wallet: JWKInterface;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let warp: Warp;
  let contractA: Contract<any>;
  let contractB: Contract<any>;
  let contractC: Contract<any>;
  let contractATxId;
  let contractBTxId;
  let contractCTxId;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1930, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1930,
      protocol: 'http'
    });

    LoggerFactory.use(new TsLogFactory());
    LoggerFactory.INST.logLevel('error');
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  async function deployContracts() {
    warp = WarpNodeFactory.forTesting(arweave);

    wallet = await arweave.wallets.generate();
    await addFunds(arweave, wallet);

    contractASrc = fs.readFileSync(path.join(__dirname, '../data/writing-contract.js'), 'utf8');
    contractAInitialState = fs.readFileSync(path.join(__dirname, '../data/writing-contract-state.json'), 'utf8');
    contractBSrc = fs.readFileSync(path.join(__dirname, '../data/example-contract.js'), 'utf8');
    contractBInitialState = fs.readFileSync(path.join(__dirname, '../data/example-contract-state.json'), 'utf8');

    contractATxId = await warp.createContract.deploy({
      wallet,
      initState: contractAInitialState,
      src: contractASrc
    });

    contractBTxId = await warp.createContract.deploy({
      wallet,
      initState: contractBInitialState,
      src: contractBSrc
    });

    contractCTxId = await warp.createContract.deploy({
      wallet,
      initState: JSON.stringify({ counter: 200 }),
      src: contractBSrc
    });

    contractA = warp
      .contract(contractATxId)
      .setEvaluationOptions({
        internalWrites: true
      })
      .connect(wallet);
    contractB = warp
      .contract(contractBTxId)
      .setEvaluationOptions({
        internalWrites: true
      })
      .connect(wallet);
    contractC = warp
      .contract(contractCTxId)
      .setEvaluationOptions({
        internalWrites: true
      })
      .connect(wallet);

    await mineBlock(arweave);
  }

  describe('with read states in between', () => {
    beforeAll(async () => {
      await deployContracts();
    });

    it('should deploy contracts with initial state', async () => {
      expect((await contractA.readState()).state.counter).toEqual(100);
      expect((await contractB.readState()).state.counter).toEqual(555);
      expect((await contractC.readState()).state.counter).toEqual(200);
    });

    it('should properly create multiple internal calls (1)', async () => {
      await contractB.writeInteraction({ function: 'add' });
      await contractB.writeInteraction({ function: 'add' });
      await contractC.writeInteraction({ function: 'add' });
      await mineBlock(arweave);

      expect((await contractB.readState()).state.counter).toEqual(557);
      expect((await contractC.readState()).state.counter).toEqual(201);
    });

    it('should properly create multiple internal calls (2)', async () => {
      await contractA.writeInteraction({
        function: 'writeInDepth',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mineBlock(arweave);

      expect((await contractB.readState()).state.counter).toEqual(567);
      expect((await contractC.readState()).state.counter).toEqual(231);
    });

    it('should properly evaluate again the state', async () => {
      expect((await contractB.readState()).state.counter).toEqual(567);
      expect((await contractC.readState()).state.counter).toEqual(231);
    });
  });

  describe('with read state at the end', () => {
    beforeAll(async () => {
      await deployContracts();
    });

    it('should properly create multiple internal calls', async () => {
      await contractB.writeInteraction({ function: 'add' });
      await contractB.writeInteraction({ function: 'add' });
      await contractC.writeInteraction({ function: 'add' });
      await mineBlock(arweave);

      await contractA.writeInteraction({
        function: 'writeInDepth',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mineBlock(arweave);

      expect((await contractB.readState()).state.counter).toEqual(567);
      expect((await contractC.readState()).state.counter).toEqual(231);
    });

    it('should properly evaluate again the state', async () => {
      expect((await contractB.readState()).state.counter).toEqual(567);
      expect((await contractC.readState()).state.counter).toEqual(231);
    });

    it('should properly evaluate state with a new client', async () => {
      const contractB2 = WarpNodeFactory.forTesting(arweave)
        .contract<any>(contractBTxId)
        .setEvaluationOptions({ internalWrites: true })
        .connect(wallet);
      const contractC2 = WarpNodeFactory.forTesting(arweave)
        .contract<any>(contractCTxId)
        .setEvaluationOptions({ internalWrites: true })
        .connect(wallet);
      expect((await contractB2.readState()).state.counter).toEqual(567);
      expect((await contractC2.readState()).state.counter).toEqual(231);
    });
  });

  describe('with read only on the middle contract', () => {
    beforeAll(async () => {
      await deployContracts();
    });

    it('should properly create multiple internal calls', async () => {
      await contractB.writeInteraction({ function: 'add' });
      await contractB.writeInteraction({ function: 'add' });
      await contractC.writeInteraction({ function: 'add' });
      await mineBlock(arweave);

      await contractA.writeInteraction({
        function: 'writeInDepth',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mineBlock(arweave);

      expect((await contractB.readState()).state.counter).toEqual(567);
    });

    it('should properly evaluate the state again', async () => {
      expect((await contractB.readState()).state.counter).toEqual(567);
    });

    it('should properly evaluate the state again', async () => {
      expect((await contractB.readState()).state.counter).toEqual(567);
      expect((await contractC.readState()).state.counter).toEqual(231);
    });
  });

  describe('with read only on the deepest contract', () => {
    beforeAll(async () => {
      await deployContracts();
    });

    it('should properly create multiple internal calls', async () => {
      await contractB.writeInteraction({ function: 'add' });
      await contractB.writeInteraction({ function: 'add' });
      await contractC.writeInteraction({ function: 'add' });
      await mineBlock(arweave);

      await contractA.writeInteraction({
        function: 'writeInDepth',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mineBlock(arweave);

      expect((await contractC.readState()).state.counter).toEqual(231);
    });

    it('should properly evaluate the state again', async () => {
      expect((await contractC.readState()).state.counter).toEqual(231);
    });

    it('should properly evaluate the state again', async () => {
      expect((await contractB.readState()).state.counter).toEqual(567);
      expect((await contractC.readState()).state.counter).toEqual(231);
    });
  });

  describe('with different maxDepths', () => {
    beforeEach(async () => {
      await deployContracts();
    });

    it('should properly evaluate contractC state for maxDepth = 3', async () => {
      contractC.setEvaluationOptions({
        maxCallDepth: 3
      });

      await contractB.writeInteraction({ function: 'add' });
      await contractB.writeInteraction({ function: 'add' });
      await contractC.writeInteraction({ function: 'add' });
      await mineBlock(arweave);

      await contractA.writeInteraction({
        function: 'writeInDepth',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mineBlock(arweave);

      expect((await contractC.readState()).state.counter).toEqual(231);
      expect((await contractC.readState()).state.counter).toEqual(231);
    });

    it('should throw when evaluating ContractC state for maxDepth = 2', async () => {
      contractC.setEvaluationOptions({
        maxCallDepth: 2,
        ignoreExceptions: false
      });

      await contractB.writeInteraction({ function: 'add' });
      await contractB.writeInteraction({ function: 'add' });
      await contractC.writeInteraction({ function: 'add' });
      await mineBlock(arweave);

      await contractA.writeInteraction({
        function: 'writeInDepth',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mineBlock(arweave);

      await expect(contractC.readState()).rejects.toThrow(/(.)*Error: Max call depth(.*)/);
    });
  });
});
