import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import {
  ArweaveGatewayInteractionsLoader,
  Contract,
  defaultCacheOptions,
  DefaultEvaluationOptions,
  GQLNodeInterface,
  LexicographicalInteractionsSorter,
  LoggerFactory,
  SmartWeave,
  SmartWeaveFactory,
  timeout
} from '@smartweave';
import path from 'path';
import { addFunds, mineBlock } from '../_helpers';
import exp from 'constants';

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
  let loader: ArweaveGatewayInteractionsLoader;

  const cacheDir = `./cache/i/tl/warp/`;
  const evalOptions = new DefaultEvaluationOptions();
  let sorter: LexicographicalInteractionsSorter;
  let interactions: GQLNodeInterface[];

  beforeAll(async () => {
    LoggerFactory.INST.logLevel('error');
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1830, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1830,
      protocol: 'http'
    });

    loader = new ArweaveGatewayInteractionsLoader(arweave);
    sorter = new LexicographicalInteractionsSorter(arweave);
    smartweave = SmartWeaveFactory.arweaveGw(arweave, {
      ...defaultCacheOptions,
      dbLocation: cacheDir
    });

    wallet = await arweave.wallets.generate();
    await addFunds(arweave, wallet);

    contractSrc = fs.readFileSync(path.join(__dirname, '../data/inf-loop-contract.js'), 'utf8');
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

    await mineBlock(arweave);
  });

  afterAll(async () => {
    await arlocal.stop();
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  it('should add interactions on one block', async () => {
    await contract.writeInteraction({ function: 'add' });
    await contract.writeInteraction({ function: 'add' });
    await contract.writeInteraction({ function: 'add' });
    await contract.writeInteraction({ function: 'add' });
    await contract.writeInteraction({ function: 'add' });
    await contract.writeInteraction({ function: 'add' });
    await contract.writeInteraction({ function: 'add' });
    await contract.writeInteraction({ function: 'add' });
    await contract.writeInteraction({ function: 'add' });
    await contract.writeInteraction({ function: 'add' });
    await mineBlock(arweave);
  });

  it('should load all interactions', async () => {
    interactions = await loader.load(contract.contractTxId(), null, null, evalOptions);
    expect(interactions.length).toBe(10);
  });

  it('should return properly sorted interactions', async () => {
    const sorted = await sorter.sort(
      interactions.map((i) => ({
        node: i,
        cursor: null
      }))
    );

    for (let i = 0; i < interactions.length; i++) {
      const interaction = interactions[i];
      expect(sorted[i].node.sortKey).toEqual(interaction.sortKey);
    }
  });

  it('should properly limit results (0,1,2)', async () => {
    const interactions2 = await loader.load(contract.contractTxId(), null, interactions[2].sortKey, evalOptions);
    expect(interactions2.length).toBe(3);

    expect(interactions2[0].sortKey).toEqual(interactions[0].sortKey);
    expect(interactions2[1].sortKey).toEqual(interactions[1].sortKey);
    expect(interactions2[2].sortKey).toEqual(interactions[2].sortKey);
  });

  it('should properly limit results (1,2)', async () => {
    const interactions2 = await loader.load(
      contract.contractTxId(),
      interactions[0].sortKey,
      interactions[2].sortKey,
      evalOptions
    );
    expect(interactions2.length).toBe(2);

    expect(interactions2[0].sortKey).toEqual(interactions[1].sortKey);
    expect(interactions2[1].sortKey).toEqual(interactions[2].sortKey);
  });

  it('should properly limit results (3,4,5,6)', async () => {
    const interactions2 = await loader.load(
      contract.contractTxId(),
      interactions[2].sortKey,
      interactions[6].sortKey,
      evalOptions
    );
    expect(interactions2.length).toBe(4);

    expect(interactions2[0].sortKey).toEqual(interactions[3].sortKey);
    expect(interactions2[1].sortKey).toEqual(interactions[4].sortKey);
    expect(interactions2[2].sortKey).toEqual(interactions[5].sortKey);
    expect(interactions2[3].sortKey).toEqual(interactions[6].sortKey);
  });

  it('should properly limit results (6,7,8,9)', async () => {
    const interactions2 = await loader.load(
      contract.contractTxId(),
      interactions[5].sortKey,
      interactions[9].sortKey,
      evalOptions
    );
    expect(interactions2.length).toBe(4);

    expect(interactions2[0].sortKey).toEqual(interactions[6].sortKey);
    expect(interactions2[1].sortKey).toEqual(interactions[7].sortKey);
    expect(interactions2[2].sortKey).toEqual(interactions[8].sortKey);
    expect(interactions2[3].sortKey).toEqual(interactions[9].sortKey);
  });

  it('should properly limit results (6,7,8,9) - no upper bound', async () => {
    const interactions2 = await loader.load(contract.contractTxId(), interactions[5].sortKey, null, evalOptions);
    expect(interactions2.length).toBe(4);

    expect(interactions2[0].sortKey).toEqual(interactions[6].sortKey);
    expect(interactions2[1].sortKey).toEqual(interactions[7].sortKey);
    expect(interactions2[2].sortKey).toEqual(interactions[8].sortKey);
    expect(interactions2[3].sortKey).toEqual(interactions[9].sortKey);
  });
});
