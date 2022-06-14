/* eslint-disable */
import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import {JWKInterface} from 'arweave/node/lib/wallet';
import {Contract, LoggerFactory, SmartWeave, SmartWeaveFactory} from '@smartweave';
import path from 'path';
import {TsLogFactory} from '../../../logging/node/TsLogFactory';
import {addFunds, mineBlock} from '../_helpers';

/**
 * This test verifies multiple internal calls from
 * one contract:
 * 1. User calls ContractA.writeMultiContract()
 * 2. ContractA.writeMultiContract() makes two internal calls
 * - ContractB.addAmount()
 * - ContractC.addAmount()
 * which causes state of ContractB and ContractC to change.
 *
 *      ┌──────┐
 * ┌────┤ User │
 * │    └──────┘
 * │    ┌───────────────────┐
 * │    │ContractA          │
 * │    ├───────────────────┤
 * └───►│writeMultiContract(├──┬──┐
 *      │ contractId1,      │  │  │
 *      │ contractId2,      │  │  │
 *      │ amount)           │  │  │
 *      └───────────────────┘  │  │
 *   ┌─────────────────────────┘  │
 *   │  ┌─────────────────────────┘
 *   │  │  ┌─────────────┐
 *   │  │  │ContractB    │
 *   │  │  ├─────────────┤
 *   │  └─►│addAmount(   │
 *   │     │ amount)     │
 *   │     └─────────────┘
 *   │     ┌─────────────┐
 *   │     │ContractC    │
 *   │     ├─────────────┤
 *   └────►│addAmount(   │
 *         │ amount)     │
 *         └─────────────┘
 */
describe('Testing internal writes', () => {
  let contractASrc: string;
  let contractAInitialState: string;
  let contractBSrc: string;
  let contractBInitialState: string;

  let wallet: JWKInterface;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let smartweave: SmartWeave;
  let contractA: Contract<any>;
  let contractB: Contract<any>;
  let contractC: Contract<any>;
  let contractATxId;
  let contractBTxId;
  let contractCTxId;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1940, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1940,
      protocol: 'http'
    });

    LoggerFactory.use(new TsLogFactory());
    LoggerFactory.INST.logLevel('error');
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  async function deployContracts() {
    smartweave = SmartWeaveFactory.forTesting(arweave);

    wallet = await arweave.wallets.generate();
    await addFunds(arweave, wallet);

    contractASrc = fs.readFileSync(path.join(__dirname, '../data/writing-contract.js'), 'utf8');
    contractAInitialState = fs.readFileSync(path.join(__dirname, '../data/writing-contract-state.json'), 'utf8');
    contractBSrc = fs.readFileSync(path.join(__dirname, '../data/example-contract.js'), 'utf8');
    contractBInitialState = fs.readFileSync(path.join(__dirname, '../data/example-contract-state.json'), 'utf8');

    contractATxId = await smartweave.createContract.deploy({
      wallet,
      initState: contractAInitialState,
      src: contractASrc
    });

    contractBTxId = await smartweave.createContract.deploy({
      wallet,
      initState: contractBInitialState,
      src: contractBSrc
    });

    contractCTxId = await smartweave.createContract.deploy({
      wallet,
      initState: JSON.stringify({counter: 200}),
      src: contractBSrc
    });

    contractA = smartweave.contract(contractATxId).setEvaluationOptions({internalWrites: true}).connect(wallet);
    contractB = smartweave.contract(contractBTxId).setEvaluationOptions({internalWrites: true}).connect(wallet);
    contractC = smartweave.contract(contractCTxId).setEvaluationOptions({internalWrites: true}).connect(wallet);

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
      await contractB.writeInteraction({function: 'add'});
      await contractB.writeInteraction({function: 'add'});
      await contractC.writeInteraction({function: 'add'});
      await mineBlock(arweave);

      expect((await contractB.readState()).state.counter).toEqual(557);
      expect((await contractC.readState()).state.counter).toEqual(201);
    });

    it('should properly create multiple internal calls (2)', async () => {
      await contractB.writeInteraction({function: 'add'});
      await contractA.writeInteraction({
        function: 'writeMultiContract',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await contractC.writeInteraction({function: 'add'});
      await mineBlock(arweave);

      expect((await contractB.readState()).state.counter).toEqual(568);
      expect((await contractC.readState()).state.counter).toEqual(212);
    });

    it('should properly create multiple internal calls (3)', async () => {
      await contractB.writeInteraction({function: 'add'});
      await contractC.writeInteraction({function: 'add'});
      await mineBlock(arweave);

      expect((await contractB.readState()).state.counter).toEqual(569);
      expect((await contractC.readState()).state.counter).toEqual(213);
    });

    it('should properly create multiple internal calls (4)', async () => {
      await contractA.writeInteraction({
        function: 'writeMultiContract',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await contractC.writeInteraction({function: 'add'});
      await contractA.writeInteraction({
        function: 'writeMultiContract',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mineBlock(arweave);
      await contractB.writeInteraction({function: 'add'});
      await contractC.writeInteraction({function: 'add'});
      await mineBlock(arweave);

      expect((await contractB.readState()).state.counter).toEqual(590);
      expect((await contractC.readState()).state.counter).toEqual(235);
    });

    it('should properly create multiple internal calls (5)', async () => {
      await contractA.writeInteraction({
        function: 'writeMultiContract',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mineBlock(arweave);
      await contractB.writeInteraction({function: 'add'});
      await mineBlock(arweave);

      expect((await contractB.readState()).state.counter).toEqual(601);
      expect((await contractC.readState()).state.counter).toEqual(245);
    });

    it('should properly create multiple internal calls (6)', async () => {
      await contractA.writeInteraction({
        function: 'writeMultiContract',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mineBlock(arweave);
      await contractB.writeInteraction({function: 'add'});
      await contractC.writeInteraction({function: 'add'});
      await mineBlock(arweave);

      expect((await contractB.readState()).state.counter).toEqual(612);
      expect((await contractC.readState()).state.counter).toEqual(256);
    });

    it('should properly create multiple internal calls (7)', async () => {
      await contractB.writeInteraction({function: 'add'});
      await contractA.writeInteraction({
        function: 'writeMultiContract',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mineBlock(arweave);

      await contractA.writeInteraction({
        function: 'writeMultiContract',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mineBlock(arweave);
      await contractB.writeInteraction({function: 'add'});
      await mineBlock(arweave);

      expect((await contractB.readState()).state.counter).toEqual(634);
      expect((await contractC.readState()).state.counter).toEqual(276);
    });

    it('should properly evaluate again the state', async () => {
      expect((await contractB.readState()).state.counter).toEqual(634);
      expect((await contractC.readState()).state.counter).toEqual(276);
    });
  });

  describe('with read state at the end', () => {
    beforeAll(async () => {
      await deployContracts();
    });

    it('should properly create multiple internal calls', async () => {
      await contractB.writeInteraction({function: 'add'});
      await contractB.writeInteraction({function: 'add'});
      await contractC.writeInteraction({function: 'add'});
      await mineBlock(arweave);

      await contractB.writeInteraction({function: 'add'});
      await contractA.writeInteraction({
        function: 'writeMultiContract',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await contractC.writeInteraction({function: 'add'});
      await mineBlock(arweave);

      await contractB.writeInteraction({function: 'add'});
      await contractC.writeInteraction({function: 'add'});
      await mineBlock(arweave);

      await contractA.writeInteraction({
        function: 'writeMultiContract',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await contractC.writeInteraction({function: 'add'});
      await contractA.writeInteraction({
        function: 'writeMultiContract',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mineBlock(arweave);
      await contractB.writeInteraction({function: 'add'});
      await contractC.writeInteraction({function: 'add'});
      await mineBlock(arweave);

      await contractA.writeInteraction({
        function: 'writeMultiContract',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mineBlock(arweave);
      await contractB.writeInteraction({function: 'add'});
      await mineBlock(arweave);

      await contractA.writeInteraction({
        function: 'writeMultiContract',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mineBlock(arweave);
      await contractB.writeInteraction({function: 'add'});
      await contractC.writeInteraction({function: 'add'});
      await mineBlock(arweave);

      await contractB.writeInteraction({function: 'add'});
      await contractA.writeInteraction({
        function: 'writeMultiContract',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mineBlock(arweave);

      await contractA.writeInteraction({
        function: 'writeMultiContract',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mineBlock(arweave);
      await contractB.writeInteraction({function: 'add'});
      await mineBlock(arweave);

      expect((await contractB.readState()).state.counter).toEqual(634);
      expect((await contractC.readState()).state.counter).toEqual(276);
    });

    it('should properly evaluate the state again', async () => {
      expect((await contractB.readState()).state.counter).toEqual(634);
      expect((await contractC.readState()).state.counter).toEqual(276);
    });

    it('should properly evaluate state with a new client', async () => {
      const contractB2 = SmartWeaveFactory.forTesting(arweave)
        .contract<any>(contractBTxId)
        .setEvaluationOptions({internalWrites: true})
        .connect(wallet);
      const contractC2 = SmartWeaveFactory.forTesting(arweave)
        .contract<any>(contractCTxId)
        .setEvaluationOptions({internalWrites: true})
        .connect(wallet);
      expect((await contractB2.readState()).state.counter).toEqual(634);
      expect((await contractC2.readState()).state.counter).toEqual(276);
    });
  });
});
