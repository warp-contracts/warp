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
let contractWithUnsafe: Contract<any>;

describe('Testing the Warp client', () => {
  let contractSrc: string;

  let wallet: JWKInterface;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1801, false);
    await arlocal.start();

    LoggerFactory.INST.logLevel('error');
    warp = WarpFactory.forLocal(1801);

    wallet = await warp.testing.generateWallet();
    contractSrc = fs.readFileSync(path.join(__dirname, '../data/token-pst-unsafe.js'), 'utf8');

    // deploying contract using the new SDK.
    const { contractTxId } = await warp.createContract.deploy({
      wallet,
      initState: JSON.stringify({}),
      src: contractSrc
    });

    contract = warp.contract(contractTxId);
    contractWithUnsafe = warp.contract(contractTxId).setEvaluationOptions({
      allowUnsafeClient: true
    });
    contract.connect(wallet);
    contractWithUnsafe.connect(wallet);

    await mineBlock(warp);
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should not allow to evaluate contract with unsafe operations by default', async () => {
    await expect(contract.readState()).rejects.toThrowError(
      'Using unsafeClient is not allowed by default. Use EvaluationOptions.allowUnsafeClient flag.'
    );
  });

  it('should allow to evaluate contract with unsafe operations by when evaluation option is set.', async () => {
    expect(await contractWithUnsafe.readState()).not.toBeUndefined();
  });
});
