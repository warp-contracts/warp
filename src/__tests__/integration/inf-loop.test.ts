import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, LoggerFactory, SmartWeave, SmartWeaveNodeFactory, timeout } from '@smartweave';
import path from 'path';

let arweave: Arweave;
let arlocal: ArLocal;
let smartweave: SmartWeave;
let contract: Contract<ExampleContractState>;

interface ExampleContractState {
  counter: number;
}
describe('Testing the SmartWeave client', () => {
  let contractSrc: string;

  let wallet: JWKInterface;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1830, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1830,
      protocol: 'http'
    });

    LoggerFactory.INST.logLevel('error');

    smartweave = SmartWeaveNodeFactory.memCached(arweave);

    wallet = await arweave.wallets.generate();

    contractSrc = fs.readFileSync(path.join(__dirname, 'data/inf-loop-contract.js'), 'utf8');

    // deploying contract using the new SDK.
    const contractTxId = await smartweave.createContract.deploy({
      wallet,
      initState: JSON.stringify({
        counter: 10
      }),
      src: contractSrc
    });

    contract = smartweave
      .contract<ExampleContractState>(contractTxId)
      .setEvaluationOptions({
        maxInteractionEvaluationTimeSeconds: 1
      })
      .connect(wallet);

    await mine();
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should properly deploy contract with initial state', async () => {
    expect(await contract.readState()).not.toBeUndefined();
  });

  it('should run the non blocking function', async () => {
    await contract.writeInteraction({
      function: 'add'
    });
    await mine();

    expect((await contract.readState()).state.counter).toEqual(20);
  });

  it('should exit long running function', async () => {
    await contract.writeInteraction({
      function: 'loop'
    });
    await mine();

    await contract.writeInteraction({
      function: 'add'
    });
    await mine();

    // wait for a while for the "inf-loop" to finish
    // otherwise Jest will complain that there are unresolved promises
    // after finishing the tests
    try {
      await timeout(2).timeoutPromise;
    } catch {
      // noop
    }
    expect((await contract.readState()).state.counter).toEqual(30);
  });
});

async function mine() {
  await arweave.api.get('mine');
}
