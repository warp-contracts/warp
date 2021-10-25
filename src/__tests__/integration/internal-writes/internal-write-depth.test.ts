import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, LoggerFactory, SmartWeave, SmartWeaveNodeFactory } from '@smartweave';
import path from 'path';
import { TsLogFactory } from '../../../logging/node/TsLogFactory';

describe('Testing internal writes', () => {
  let contractASrc: string;
  let contractAInitialState: string;
  let contractBSrc: string;
  let contractBInitialState: string;

  let wallet: JWKInterface;
  let walletAddress: string;

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
    arlocal = new ArLocal(1920, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1920,
      protocol: 'http'
    });

    LoggerFactory.use(new TsLogFactory());
    LoggerFactory.INST.logLevel('error');
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  async function deployContracts() {
    smartweave = SmartWeaveNodeFactory.memCached(arweave);

    wallet = await arweave.wallets.generate();
    walletAddress = await arweave.wallets.jwkToAddress(wallet);

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
      initState: JSON.stringify({ counter: 200 }),
      src: contractBSrc
    });

    contractA = smartweave.contract(contractATxId).connect(wallet);
    contractB = smartweave.contract(contractBTxId).connect(wallet);
    contractC = smartweave.contract(contractCTxId).connect(wallet);

    await mine();
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
      await mine();

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
      await mine();

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
      await mine();

      await contractA.writeInteraction({
        function: 'writeInDepth',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mine();

      expect((await contractB.readState()).state.counter).toEqual(567);
      expect((await contractC.readState()).state.counter).toEqual(231);
    });

    it('should properly evaluate again the state', async () => {
      expect((await contractB.readState()).state.counter).toEqual(567);
      expect((await contractC.readState()).state.counter).toEqual(231);
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
      await mine();

      await contractA.writeInteraction({
        function: 'writeInDepth',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mine();

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
      await mine();

      await contractA.writeInteraction({
        function: 'writeInDepth',
        contractId1: contractBTxId,
        contractId2: contractCTxId,
        amount: 10
      });
      await mine();

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

  async function mine() {
    await arweave.api.get('mine');
  }
});
