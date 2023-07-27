/* eslint-disable */
import fs from 'fs';

import ArLocal from 'arlocal';
import { JWKInterface } from 'arweave/node/lib/wallet';
import path from 'path';
import { mineBlock } from '../_helpers';
import { Contract } from '../../../contract/Contract';
import { Warp } from '../../../core/Warp';
import { defaultCacheOptions, WarpFactory } from '../../../core/WarpFactory';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { DeployPlugin } from 'warp-contracts-plugin-deploy';
import { VM2Plugin } from 'warp-contracts-plugin-vm2';
import { MemoryLevel } from 'memory-level';
import { CacheKey } from '../../../cache/SortKeyCache';
import { SqliteContractCache } from 'warp-contracts-sqlite';

interface ExampleContractState {
  counter: number;
  errorCounter: number;
}

describe('Testing internal writes', () => {
  let callingContractSrc: string;
  let callingContractInitialState: string;
  let calleeContractSrc: string;
  let calleeInitialState: string;

  let wallet: JWKInterface;

  let arlocal: ArLocal;
  let warp: Warp;
  let calleeContract: Contract<ExampleContractState>;
  let callingContract: Contract<ExampleContractState>;
  let calleeTxId;
  let callingTxId;

  const port = 1666;

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
    warp = WarpFactory.forLocal(port)
      .use(new DeployPlugin())
      .useStateCache(
        new SqliteContractCache(
          {
            ...defaultCacheOptions,
            dbLocation: `./cache/warp/sqlite/state`
          },
          {
            maxEntriesPerContract: 1000
          }
        )
      );
    ({ jwk: wallet } = await warp.generateWallet());

    callingContractSrc = fs.readFileSync(path.join(__dirname, '../data/example-contract.js'), 'utf8');
    callingContractInitialState = JSON.stringify({
      counter: 0
    });
    calleeContractSrc = callingContractSrc;
    calleeInitialState = callingContractInitialState;

    ({ contractTxId: calleeTxId } = await warp.deploy({
      wallet,
      initState: calleeInitialState,
      src: calleeContractSrc
    }));

    ({ contractTxId: callingTxId } = await warp.deploy({
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

    callingContract = warp
      .contract<ExampleContractState>(callingTxId)
      .setEvaluationOptions({
        internalWrites: true,
        mineArLocalBlocks: false
      })
      .connect(wallet);

    await mineBlock(warp);
  }

  async function currentContractEntries(contractTxId: string): Promise<[[string, string]]> {
    const storage: MemoryLevel<string, any> = await warp.stateEvaluator.getCache().storage();
    const sub = storage.sublevel(contractTxId, { valueEncoding: 'json' });
    return await sub.iterator().all();
  }

  describe('with read states on internal write interaction', () => {
    it('should deploy callee contract with initial state', async () => {
      await deployContracts();
      expect((await calleeContract.readState()).cachedValue.state.counter).toEqual(0);
    });

    it('with successful internal write', async () => {
      await calleeContract.writeInteraction({ function: 'add' });
      await callingContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);

      await calleeContract.writeInteraction({ function: 'add' });
      await callingContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);

      await calleeContract.writeInteraction({ function: 'add' });
      await callingContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);

      await callingContract.writeInteraction({
        function: 'addAndWrite',
        contractId: calleeContract.txId(),
        amount: 10
      });
      await mineBlock(warp);
      const iwBlockHeight = (await warp.arweave.network.getInfo()).height;

      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);

      await calleeContract.readState(iwBlockHeight);
      const result = await warp.stateEvaluator.latestAvailableState<ExampleContractState>(calleeContract.txId());
      console.dir(result, { depth: null });

      // '3' from direct interaction + '10' from interact write
      expect(result.cachedValue.state.counter).toEqual(13);
      expect(Object.keys(result.cachedValue.validity).length).toEqual(4);

      const freshWarp = WarpFactory.forLocal(port).use(new DeployPlugin());
      const freshCalleeContract = freshWarp
        .contract<ExampleContractState>(calleeTxId)
        .setEvaluationOptions({
          internalWrites: true,
          mineArLocalBlocks: false
        })
        .connect(wallet);

      await freshCalleeContract.readState(iwBlockHeight + 1);
      const freshResult = await freshWarp.stateEvaluator.latestAvailableState<ExampleContractState>(
        freshCalleeContract.txId()
      );
      expect(freshResult.cachedValue.state.counter).toEqual(14);

      const calleeInteractions = await freshWarp.interactionsLoader.load(
        freshCalleeContract.txId(),
        undefined,
        undefined,
        freshCalleeContract.evaluationOptions()
      );
      const iwInteraction = calleeInteractions[calleeInteractions.length - 2];
      const iwState = await freshWarp.stateEvaluator
        .getCache()
        .get(new CacheKey(freshCalleeContract.txId(), iwInteraction.sortKey));
      expect((iwState.cachedValue.state as any).counter).toEqual(13);
      expect(Object.keys(result.cachedValue.validity).length).toEqual(4);
    });

    it('with failed internal write', async () => {
      await deployContracts();
      expect((await calleeContract.readState()).cachedValue.state.counter).toEqual(0);
      await calleeContract.writeInteraction({ function: 'add' });
      await callingContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);

      await calleeContract.writeInteraction({ function: 'add' });
      await callingContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);

      await calleeContract.writeInteraction({ function: 'add' });
      await callingContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);

      await callingContract.writeInteraction({
        function: 'addAndWrite',
        contractId: calleeContract.txId(),
        amount: 10,
        throw: true
      });
      await mineBlock(warp);
      const iwBlockHeight = (await warp.arweave.network.getInfo()).height;

      await calleeContract.writeInteraction({ function: 'add' });
      await mineBlock(warp);

      const warp1 = WarpFactory.forLocal(port)
        .use(new DeployPlugin())
        .useStateCache(
          new SqliteContractCache(
            {
              ...defaultCacheOptions,
              dbLocation: `./cache/warp/1/sqlite/state`
            },
            {
              maxEntriesPerContract: 1000
            }
          )
        );
      const calleeContract1 = warp1
        .contract<ExampleContractState>(calleeTxId)
        .setEvaluationOptions({
          internalWrites: true,
          mineArLocalBlocks: false
        })
        .connect(wallet);

      await calleeContract1.readState(iwBlockHeight);
      const result = await warp1.stateEvaluator.latestAvailableState<ExampleContractState>(calleeContract1.txId());
      console.dir(result, { depth: null });

      expect(result.cachedValue.state.counter).toEqual(3);
      expect(Object.keys(result.cachedValue.validity).length).toEqual(4);

      const warp2 = WarpFactory.forLocal(port)
        .use(new DeployPlugin())
        .useStateCache(
          new SqliteContractCache(
            {
              ...defaultCacheOptions,
              dbLocation: `./cache/warp/2/sqlite/state`
            },
            {
              maxEntriesPerContract: 1000
            }
          )
        );
      const calleeContract2 = warp2
        .contract<ExampleContractState>(calleeTxId)
        .setEvaluationOptions({
          internalWrites: true,
          mineArLocalBlocks: false
        })
        .connect(wallet);

      await calleeContract2.readState(iwBlockHeight + 1);
      const freshResult = await warp2.stateEvaluator.latestAvailableState<ExampleContractState>(calleeContract2.txId());
      expect(freshResult.cachedValue.state.counter).toEqual(4);

      const calleeInteractions = await warp2.interactionsLoader.load(
        calleeContract2.txId(),
        undefined,
        undefined,
        calleeContract2.evaluationOptions()
      );
      const iwInteraction = calleeInteractions[calleeInteractions.length - 2];
      const iwState = await warp2.stateEvaluator
        .getCache()
        .get(new CacheKey(calleeContract2.txId(), iwInteraction.sortKey));
      expect((iwState.cachedValue.state as any).counter).toEqual(3);
      expect(Object.keys(result.cachedValue.validity).length).toEqual(4);
    });
  });
});
