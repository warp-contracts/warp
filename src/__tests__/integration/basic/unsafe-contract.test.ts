import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, defaultCacheOptions, LoggerFactory, SmartWeave, SmartWeaveFactory } from '@smartweave';
import path from 'path';
import { addFunds, mineBlock } from '../_helpers';

let arweave: Arweave;
let arlocal: ArLocal;
let smartweave: SmartWeave;
let contract: Contract<any>;
let contractWithUnsafe: Contract<any>;

describe('Testing the SmartWeave client', () => {
  let contractSrc: string;

  let wallet: JWKInterface;
  const cacheDir = `./cache/i/uc/warp/`;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1801, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1801,
      protocol: 'http'
    });

    LoggerFactory.INST.logLevel('error');

    smartweave = SmartWeaveFactory.arweaveGw(arweave, {
      ...defaultCacheOptions,
      dbLocation: cacheDir
    });

    wallet = await arweave.wallets.generate();
    await addFunds(arweave, wallet);

    contractSrc = fs.readFileSync(path.join(__dirname, '../data/token-pst-unsafe.js'), 'utf8');

    // deploying contract using the new SDK.
    const contractTxId = await smartweave.createContract.deploy({
      wallet,
      initState: JSON.stringify({}),
      src: contractSrc
    });

    contract = smartweave.contract(contractTxId);
    contractWithUnsafe = smartweave.contract(contractTxId).setEvaluationOptions({
      allowUnsafeClient: true
    });
    contract.connect(wallet);
    contractWithUnsafe.connect(wallet);

    await mineBlock(arweave);
  });

  afterAll(async () => {
    await arlocal.stop();
    fs.rmSync(cacheDir, { recursive: true, force: true });
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
