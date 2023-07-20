import fs from 'fs';

import ArLocal from 'arlocal';
import { JWKInterface } from 'arweave/node/lib/wallet';
import path from 'path';
import { mineBlock } from '../_helpers';
import { Contract } from '../../../contract/Contract';
import { Warp } from '../../../core/Warp';
import { WarpFactory } from '../../../core/WarpFactory';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { DeployPlugin } from 'warp-contracts-plugin-deploy';

/**
 * This test verifies "deep" reads between contracts.
 *
 *
 *  rootContract
 *     └───► node1Contract
 *                 └───► node20Contract
 *                          └───► leafContract:  balances['asd'] = 300
 *                 └───► node21Contract
 *                          └───► leafContract:  balances['asd'] = 1350
 *                 └───► node22Contract
 *                          └───► leafContract:  balances['asd'] = 1100
 *
 */
describe('Testing deep internal reads', () => {
  let wallet: JWKInterface;

  let arLocal: ArLocal;
  let warp: Warp;
  let leafContract: Contract<any>;
  let node20Contract: Contract<any>;
  let node21Contract: Contract<any>;
  let node22Contract: Contract<any>;
  let node1Contract: Contract<any>;
  let rootContract: Contract<any>;

  let leafId;
  let node20Id;
  let node21Id;
  let node22Id;
  let nod1Id;
  let rootId;

  const port = 1932;

  beforeAll(async () => {
    arLocal = new ArLocal(port, false);
    await arLocal.start();
    LoggerFactory.INST.logLevel('info');
  });

  afterAll(async () => {
    await arLocal.stop();
  });

  async function deployContracts() {
    warp = WarpFactory.forLocal(port).use(new DeployPlugin());

    ({ jwk: wallet } = await warp.generateWallet());

    const leafSrc = fs.readFileSync(path.join(__dirname, '../data/nested-read/leaf-contract.js'), 'utf8');
    const leafState = fs.readFileSync(
      path.join(__dirname, '../data/nested-read/leaf-contract-init-state.json'),
      'utf8'
    );
    const nodeSrc = fs.readFileSync(path.join(__dirname, '../data/nested-read/node-contract.js'), 'utf8');
    const nodeState = fs.readFileSync(
      path.join(__dirname, '../data/nested-read/node-contract-init-state.json'),
      'utf8'
    );

    ({ contractTxId: leafId } = await warp.deploy({
      wallet,
      initState: leafState,
      src: leafSrc
    }));

    ({ contractTxId: node20Id } = await warp.deploy({
      wallet,
      initState: nodeState,
      src: nodeSrc
    }));

    ({ contractTxId: node21Id } = await warp.deploy({
      wallet,
      initState: nodeState,
      src: nodeSrc
    }));

    ({ contractTxId: node22Id } = await warp.deploy({
      wallet,
      initState: nodeState,
      src: nodeSrc
    }));

    ({ contractTxId: nod1Id } = await warp.deploy({
      wallet,
      initState: nodeState,
      src: nodeSrc
    }));

    ({ contractTxId: rootId } = await warp.deploy({
      wallet,
      initState: nodeState,
      src: nodeSrc
    }));

    rootContract = warp.contract(rootId).connect(wallet);
    node20Contract = warp.contract(node20Id).connect(wallet);
    node21Contract = warp.contract(node21Id).connect(wallet);
    node22Contract = warp.contract(node22Id).connect(wallet);
    node1Contract = warp.contract(nod1Id).connect(wallet);
    leafContract = warp.contract(leafId).connect(wallet);

    await mineBlock(warp);
    await mineBlock(warp);
  }

  describe('with the same leaf contract', () => {
    beforeAll(async () => {
      await deployContracts();
    });

    it('root contract should have the latest balance', async () => {
      await leafContract.writeInteraction({ function: 'increase', target: 'asd', qty: 25 });
      await leafContract.writeInteraction({ function: 'increase', target: 'asd', qty: 25 });
      await leafContract.writeInteraction({ function: 'increase', target: 'asd', qty: 50 });
      await leafContract.writeInteraction({ function: 'increase', target: 'asd', qty: 50 });
      await leafContract.writeInteraction({ function: 'increase', target: 'asd', qty: 50 });
      await mineBlock(warp);
      await node20Contract.writeInteraction({ function: 'readBalanceFrom', tokenAddress: leafId, contractTxId: 'asd' });
      await mineBlock(warp);
      await leafContract.writeInteraction({ function: 'increase', target: 'asd', qty: 200 });
      await leafContract.writeInteraction({ function: 'increase', target: 'asd', qty: 100 });
      await leafContract.writeInteraction({ function: 'increase', target: 'asd', qty: 100 });
      await mineBlock(warp);
      await leafContract.writeInteraction({ function: 'increase', target: 'asd', qty: 100 });
      await mineBlock(warp);
      await leafContract.writeInteraction({ function: 'increase', target: 'asd', qty: 100 });
      await mineBlock(warp);
      await leafContract.writeInteraction({ function: 'increase', target: 'asd', qty: 100 });
      await mineBlock(warp);
      await leafContract.writeInteraction({ function: 'increase', target: 'asd', qty: 100 });
      await mineBlock(warp);
      await node22Contract.writeInteraction({ function: 'readBalanceFrom', tokenAddress: leafId, contractTxId: 'asd' });
      await mineBlock(warp);
      await leafContract.writeInteraction({ function: 'increase', target: 'asd', qty: 50 });
      await leafContract.writeInteraction({ function: 'increase', target: 'asd', qty: 100 });
      await leafContract.writeInteraction({ function: 'increase', target: 'asd', qty: 100 });
      await mineBlock(warp);
      await node21Contract.writeInteraction({ function: 'readBalanceFrom', tokenAddress: leafId, contractTxId: 'asd' });
      await mineBlock(warp);
      await node1Contract.writeInteraction({
        function: 'readBalanceFrom',
        tokenAddress: node20Id,
        contractTxId: 'asd'
      });
      await mineBlock(warp);
      await node1Contract.writeInteraction({
        function: 'readBalanceFrom',
        tokenAddress: node21Id,
        contractTxId: 'asd'
      });
      await mineBlock(warp);
      await node1Contract.writeInteraction({
        function: 'readBalanceFrom',
        tokenAddress: node22Id,
        contractTxId: 'asd'
      });
      await mineBlock(warp);
      await rootContract.writeInteraction({ function: 'readBalanceFrom', tokenAddress: nod1Id, contractTxId: 'asd' });
      await mineBlock(warp);

      const rootResult = await warp.pst(rootId)
        .setEvaluationOptions({
          cacheEveryNInteractions: 1,
        }).readState();
      expect(rootResult.cachedValue.state.balances['asd']).toEqual(1100);

      const node20Result = await warp.pst(node20Id).readState();
      expect(node20Result.cachedValue.state.balances['asd']).toEqual(300);

      const node21Result = await warp.pst(node21Id).readState();
      expect(node21Result.cachedValue.state.balances['asd']).toEqual(1350);

      const node22Result = await warp.pst(node22Id).readState();
      expect(node22Result.cachedValue.state.balances['asd']).toEqual(1100);
    });
  });
});
