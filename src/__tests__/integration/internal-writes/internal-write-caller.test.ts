import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, LoggerFactory, SmartWeave, SmartWeaveNodeFactory } from '@smartweave';
import path from 'path';
import { TsLogFactory } from '../../../logging/node/TsLogFactory';

/**
 * This verifies whether combination of read and write state works properly.
 * 1. User calls ContractA.writeContractCheck(amount)
 * 2. ContractA.writeContractCheck() checks ContractB.counter value
 * 3. If ContractB.counter > 600 - it calls ContractB.addAmount(-amount)
 * 4. If ContractB.counter <= 600 - it call ContractB.addAmount(amount)
 * 5. ContractA adds to its counter current value of ContractB.counter
 *
 *           ┌──────┐
 *      ┌────┤ User │
 *      │    └──────┘
 *      │    ┌───────────────────┐
 *      │    │ContractA          │
 *      │    ├───────────────────┤
 *      └───►│writeContractCheck(├─────┐
 *           │ contractId,       │     │
 *           │ amount)           │     │
 *           └───────────────────┘     │
 *                      ┌──────────────┘
 *                      ▼
 *        ┌───────────────────────────┐
 *        │                           │
 *        │  ContractB.counter > 600  │
 *        │                           │
 *        └────────────┬──────────────┘
 *              No     │     Yes
 *         ┌───────────┴─────────────┐
 *         ▼                         ▼
 * ┌─────────────┐             ┌─────────────┐
 * │ContractB    │             │ContractB    │
 * ├─────────────┤             ├─────────────┤
 * │addAmount(   │             │addAmount(   │
 * │ amount)     │             │ -amount)    │
 * └───────┬─────┘             └──────┬──────┘
 *         └────────────┬─────────────┘
 *                      ▼
 *  ┌────────────────────────────────────────┐
 *  │                                        │
 *  │ ContractA.counter += ContractB.counter │
 *  │                                        │
 *  └────────────────────────────────────────┘
 */
describe('Testing internal writes', () => {
  let callingContractSrc: string;
  let callingContractInitialState: string;
  let calleeContractSrc: string;
  let calleeInitialState: string;

  let wallet: JWKInterface;
  let walletAddress: string;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let smartweave: SmartWeave;
  let calleeContract: Contract<any>;
  let callingContract: Contract<any>;
  let calleeTxId;

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
      .contract(calleeTxId)
      .setEvaluationOptions({
        internalWrites: true
      })
      .connect(wallet);
    callingContract = smartweave
      .contract(callingTxId)
      .setEvaluationOptions({
        internalWrites: true
      })
      .connect(wallet);

    await mine();
  }

  describe('with read states in between', () => {
    beforeAll(async () => {
      await deployContracts();
    });

    it('should deploy contracts with initial state', async () => {
      expect((await calleeContract.readState()).state.counter).toEqual(555);
      expect((await callingContract.readState()).state.counter).toEqual(100);
    });

    it('should write direct interactions', async () => {
      await calleeContract.writeInteraction({ function: 'add' });
      await mine();
      await callingContract.writeInteraction({
        function: 'writeContractCheck',
        contractId: calleeTxId,
        amount: 400
      });
      await mine();
      expect((await calleeContract.readState()).state.counter).toEqual(555 + 1 + 400);
      expect((await callingContract.readState()).state.counter).toEqual(100 + 555 + 1 + 400);

      await callingContract.writeInteraction({
        function: 'writeContractCheck',
        contractId: calleeTxId,
        amount: 100
      });
      await mine();
      expect((await calleeContract.readState()).state.counter).toEqual(956 - 100);
      expect((await callingContract.readState()).state.counter).toEqual(1056 + 856);

      await callingContract.writeInteraction({
        function: 'writeContractCheck',
        contractId: calleeTxId,
        amount: 300
      });
      await mine();
      expect((await calleeContract.readState()).state.counter).toEqual(856 - 300);
      expect((await callingContract.readState()).state.counter).toEqual(1912 + 556);
    });

    it('should properly evaluate state again', async () => {
      expect((await calleeContract.readState()).state.counter).toEqual(856 - 300);
      expect((await callingContract.readState()).state.counter).toEqual(1912 + 556);
    });
  });

  describe('with read state at the end', () => {
    beforeAll(async () => {
      await deployContracts();
    });

    it('should write direct interactions', async () => {
      await calleeContract.writeInteraction({ function: 'add' });
      await mine();
      await callingContract.writeInteraction({
        function: 'writeContractCheck',
        contractId: calleeTxId,
        amount: 400
      });
      await mine();

      await callingContract.writeInteraction({
        function: 'writeContractCheck',
        contractId: calleeTxId,
        amount: 100
      });
      await mine();

      await callingContract.writeInteraction({
        function: 'writeContractCheck',
        contractId: calleeTxId,
        amount: 300
      });
      await mine();
      expect((await callingContract.readState()).state.counter).toEqual(1912 + 556);
      expect((await calleeContract.readState()).state.counter).toEqual(856 - 300);
    });

    it('should properly evaluate state again', async () => {
      expect((await calleeContract.readState()).state.counter).toEqual(856 - 300);
      expect((await callingContract.readState()).state.counter).toEqual(1912 + 556);
    });
  });

  async function mine() {
    await arweave.api.get('mine');
  }
});
