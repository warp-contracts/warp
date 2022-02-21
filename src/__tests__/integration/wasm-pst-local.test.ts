import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, LoggerFactory, SmartWeave, SmartWeaveNodeFactory } from '@smartweave';
import path from 'path';
import { addFunds, mineBlock } from './_helpers';

interface ExampleContractState {
  balances: Map<string, number>;
}

describe('Testing the SmartWeave client for WASM contract', () => {
  let contractSrc: Buffer;
  let initialState: { balances: { "0x123": number } };
  let contractTxId: string;

  let wallet: JWKInterface;
  let txOwner: string;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let smartweave: SmartWeave;
  let contract: Contract<ExampleContractState>;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1300, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1300,
      protocol: 'http'
    });

    LoggerFactory.INST.logLevel('error');
    LoggerFactory.INST.logLevel('debug', 'WasmContractHandlerApi');
    LoggerFactory.INST.logLevel('debug', 'WASM');

    smartweave = SmartWeaveNodeFactory.memCached(arweave);
    wallet = await arweave.wallets.generate();
    txOwner = await arweave.wallets.getAddress(wallet);
    await addFunds(arweave, wallet);

    contractSrc = fs.readFileSync(path.join(__dirname, 'data/wasm/pst.wasm'));
    initialState = {
      balances: {
        '0x123': 1000
      }
    };

    initialState.balances[txOwner] = 100;

    // deploying contract using the new SDK.
    contractTxId = await smartweave.createContract.deploy({
      wallet,
      initState: JSON.stringify(initialState),
      src: contractSrc
    });

    contract = smartweave.contract<ExampleContractState>(contractTxId).setEvaluationOptions({
      gasLimit: 12000000
    });
    contract.connect(wallet);

    await mineBlock(arweave);
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should properly deploy contract', async () => {
    const contractTx = await arweave.transactions.get(contractTxId);
    expect(contractTx).not.toBeNull();
  });

  it('should properly read initial state', async () => {
    const state = await contract.readState();
    expect((await contract.readState()).state.balances['0x123']).toEqual(1000);
    expect((await contract.readState()).state.balances[txOwner]).toEqual(100);
  });

  it('should properly register transfer', async () => {
    await contract.writeInteraction({ function: 'transfer', target: '0x777', qty: 7 });
    await mineBlock(arweave);
    expect((await contract.readState()).state.balances['0x123']).toEqual(1000);
    expect((await contract.readState()).state.balances[txOwner]).toEqual(93);
    expect((await contract.readState()).state.balances['0x777']).toEqual(7);
  });
});
