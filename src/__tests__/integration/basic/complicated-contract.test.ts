import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, LoggerFactory, Warp, WarpNodeFactory } from '@warp';
import path from 'path';
import { addFunds, mineBlock } from '../_helpers';

let arweave: Arweave;
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

    arweave = Arweave.init({
      host: 'localhost',
      port: 1800,
      protocol: 'http'
    });

    LoggerFactory.INST.logLevel('error');

    warp = WarpNodeFactory.forTesting(arweave);

    wallet = await arweave.wallets.generate();
    await addFunds(arweave, wallet);

    contractSrc = fs.readFileSync(path.join(__dirname, '../data/very-complicated-contract.js'), 'utf8');

    // deploying contract using the new SDK.
    const contractTxId = await warp.createContract.deploy({
      wallet,
      initState: JSON.stringify({}),
      src: contractSrc
    });

    contract = warp.contract(contractTxId);
    contractVM = warp.contract(contractTxId).setEvaluationOptions({
      useVM2: true
    });
    contract.connect(wallet);
    contractVM.connect(wallet);

    await mineBlock(arweave);
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should properly deploy contract with initial state', async () => {
    expect(await contract.readState()).not.toBeUndefined();
  });

  it('sandboxed should not allow to calculate state with "eval" in source code', async () => {
    await expect(contractVM.readState()).rejects.toThrowError(
      'Code generation from strings disallowed for this context'
    );
  });
});
