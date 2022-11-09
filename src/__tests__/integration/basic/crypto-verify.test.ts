import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import path from 'path';
import { mineBlock } from '../_helpers';
import { PstState, PstContract } from '../../../contract/PstContract';
import { Warp } from '../../../core/Warp';
import { WarpFactory } from '../../../core/WarpFactory';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { Contract } from '../../../contract/Contract';

interface ExampleContractState {
  count: number;
  messages: any;
}

describe('Testing the Profit Sharing Token', () => {
  let contractSrc: string;

  let wallet: JWKInterface;
  let walletAddress: string;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let warp: Warp;
  let contract: Contract<ExampleContractState>;
  let pstVM: PstContract;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1820, false);
    await arlocal.start();
    LoggerFactory.INST.logLevel('error');

    warp = WarpFactory.forLocal(1820);

    ({ arweave } = warp);
    ({ jwk: wallet, address: walletAddress } = await warp.testing.generateWallet());

    contractSrc = fs.readFileSync(path.join(__dirname, '../data/crypto-verify/crypto-verify.js'), 'utf8');
    const stateFromFile: PstState = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../data/crypto-verify/crypto-verify.json'), 'utf8')
    );

    // deploying contract using the new SDK.
    const { contractTxId } = await warp.createContract.deploy({
      wallet,
      initState: JSON.stringify(stateFromFile),
      src: contractSrc
    });

    // connecting to the contract
    contract = warp.contract<ExampleContractState>(contractTxId).setEvaluationOptions({
      allowUnsafeClient: true
    });

    // connecting wallet to the contract
    contract.connect(wallet);

    await mineBlock(warp);
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should read pst state and balance data', async () => {
    const { originalTxId } = await contract.writeInteraction({ function: 'add', content: 'lol' });
    await mineBlock(warp);

    await contract.writeInteraction({ function: 'verify', id: originalTxId });

    await mineBlock(warp);

    const { cachedValue } = await contract.readState();
    console.log(cachedValue);

    expect(cachedValue.state.count).toEqual(1);
  });
});
