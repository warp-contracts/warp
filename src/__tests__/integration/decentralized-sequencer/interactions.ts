import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import fs from 'fs';
import path from 'path';
import { DeployPlugin, ArweaveSigner } from 'warp-contracts-plugin-deploy';
import { Contract } from '../../../contract/Contract';
import { Warp } from '../../../core/Warp';
import { WarpFactory, defaultCacheOptions, defaultWarpGwOptions } from '../../../core/WarpFactory';
import { SourceType } from '../../../core/modules/impl/WarpGatewayInteractionsLoader';

interface ExampleContractState {
  counter: number;
}

// FIXME: change to the address of the sequencer on dev
const SEQUENCER_URL = 'http://localhost:1317';

describe('Testing a decentralized sequencer', () => {
  let contractSrc: string;
  let initialState: string;

  let wallet: JWKInterface;

  let arlocal: ArLocal;
  let warp: Warp;
  let contract: Contract<ExampleContractState>;

  beforeAll(async () => {
    const port = 1813;
    arlocal = new ArLocal(port, false);
    await arlocal.start();

    const arweave = Arweave.init({
      host: 'localhost',
      port: port,
      protocol: 'http'
    });

    const cacheOptions = {
      ...defaultCacheOptions,
      inMemory: true
    }
    const gatewayOptions = { ...defaultWarpGwOptions, source: SourceType.WARP_SEQUENCER, confirmationStatus: { notCorrupted: true } }

    warp = WarpFactory
      .custom(arweave, cacheOptions, 'custom')
      .useWarpGateway(gatewayOptions, cacheOptions)
      .build()
      .use(new DeployPlugin());

    ({ jwk: wallet } = await warp.generateWallet());

    contractSrc = fs.readFileSync(path.join(__dirname, '../data/example-contract.js'), 'utf8');
    initialState = fs.readFileSync(path.join(__dirname, '../data/example-contract-state.json'), 'utf8');

    const { contractTxId } = await warp.deploy({
      wallet: new ArweaveSigner(wallet),
      initState: initialState,
      src: contractSrc
    });

    contract = warp.contract<ExampleContractState>(contractTxId).setEvaluationOptions({
      useDecentralizedSequencer: true,
      sequencerUrl: SEQUENCER_URL
    });
    contract.connect(wallet);

  });

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should add new interactions waiting for confirmation from the sequencer', async () => {
    await contract.writeInteraction({ function: 'add' }, { waitForConfirmation: true });
    const result = await contract.writeInteraction({ function: 'add' }, { waitForConfirmation: true });
    expect(result).toHaveProperty('originalTxId')
  });

  it('should throw an error after adding an interaction without waiting for confirmation of the previous one', async () => {
    await contract.writeInteraction({ function: 'add' });
    try {
      await contract.writeInteraction({ function: 'add' })
    } catch(e) {
      expect(e.message).toContain('account sequence mismatch, expected 3, got 2: incorrect account sequence');
    }
  });
});
