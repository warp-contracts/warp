import fs from 'fs';

import ArLocal from 'arlocal';
import { JWKInterface } from 'arweave/node/lib/wallet';
import path from 'path';
import { Contract } from '../../../contract/Contract';
import { Warp } from '../../../core/Warp';
import { WarpFactory } from '../../../core/WarpFactory';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { DeployPlugin } from 'warp-contracts-plugin-deploy';
import { VM2Plugin } from 'warp-contracts-plugin-vm2';

let arlocal: ArLocal;
let warpVm: Warp;
let contractVm: Contract<any>;

describe('Testing the Warp client', () => {
  let contractSrc: string;

  let wallet: JWKInterface;
  let walletAddress: string;
  let contractTxIdVm;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1802, false);
    await arlocal.start();

    LoggerFactory.INST.logLevel('error');
    warpVm = WarpFactory.forLocal(1802).use(new DeployPlugin()).use(new VM2Plugin());

    ({ jwk: wallet, address: walletAddress } = await warpVm.generateWallet());
    contractSrc = fs.readFileSync(path.join(__dirname, '../data/non-deterministic.js'), 'utf8');

    // deploying contract using the new SDK.
    ({ contractTxId: contractTxIdVm } = await warpVm.deploy({
      wallet,
      initState: JSON.stringify({}),
      src: contractSrc
    }));

    contractVm = warpVm.contract(contractTxIdVm);
    contractVm.connect(wallet);
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should not allow to use Math.random', async () => {
    await contractVm.writeInteraction({ function: 'mathRandom' });

    expect(Object.keys((await contractVm.readState()).cachedValue.state).length).toBe(0);
  });

  it('should not allow to use Date.now', async () => {
    await contractVm.writeInteraction({ function: 'dateNow' });

    expect(Object.keys((await contractVm.readState()).cachedValue.state).length).toBe(0);
  });

  it('should not allow to use Date', async () => {
    await contractVm.writeInteraction({ function: 'date' });

    expect(Object.keys((await contractVm.readState()).cachedValue.state).length).toBe(0);
  });

  it('should not allow to use setTimeout', async () => {
    await contractVm.writeInteraction({ function: 'setTimeout' });

    expect(Object.keys((await contractVm.readState()).cachedValue.state).length).toBe(0);
  });

  it('should not allow to use setInterval', async () => {
    await contractVm.writeInteraction({ function: 'setInterval' });

    expect(Object.keys((await contractVm.readState()).cachedValue.state).length).toBe(0);
  });

  it('should not allow to use weakMap', async () => {
    await contractVm.writeInteraction({ function: 'weakMap' });

    expect(Object.keys((await contractVm.readState()).cachedValue.state).length).toBe(0);
  });

  it('should not allow to use weakRef', async () => {
    await contractVm.writeInteraction({ function: 'weakRef' });

    expect(Object.keys((await contractVm.readState()).cachedValue.state).length).toBe(0);
  });

  it('should allow to use some specific Date', async () => {
    await contractVm.writeInteraction({ function: 'specificDate' });

    const state = (await contractVm.readState()).cachedValue.state;
    expect(Object.keys(state).length).toEqual(1);
    expect(state['specificDate']).toEqual(new Date('2001-08-20'));
  });

  it('should allow to use some deterministic Math methods', async () => {
    await contractVm.writeInteraction({ function: 'mathMax' });

    const state = (await contractVm.readState()).cachedValue.state;
    expect(Object.keys(state).length).toEqual(2);
    expect(state['mathMax']).toEqual(3);
  });
});
