import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, LoggerFactory, Warp, WarpFactory } from '@warp';
import path from 'path';
import { mineBlock } from '../_helpers';

let arlocal: ArLocal;
let warp: Warp;
let contract: Contract<any>;
let contractVM: Contract<any>;

describe('Testing the Warp client', () => {
  let contractSrc: string;

  let wallet: JWKInterface;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1800, false);
    await arlocal.start();

    LoggerFactory.INST.logLevel('error');

    warp = WarpFactory.forLocal(1800);

    wallet = await warp.testing.generateWallet();

    contractSrc = fs.readFileSync(path.join(__dirname, '../data/very-complicated-contract.js'), 'utf8');

    // deploying contract using the new SDK.
    const { contractTxId } = await warp.createContract.deploy({
      wallet,
      initState: JSON.stringify({}),
      src: contractSrc
    });

    contract = warp.contract(contractTxId).setEvaluationOptions({
      mineArLocalBlocks: false
    });
    contractVM = warp.contract(contractTxId).setEvaluationOptions({
      useIVM: true,
      mineArLocalBlocks: false
    });
    contract.connect(wallet);
    contractVM.connect(wallet);

    await mineBlock(warp);
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should properly deploy contract with initial state', async () => {
    expect(await contract.readState()).not.toBeUndefined();
    expect(await contractVM.readState()).not.toBeUndefined();
  });
});
