import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { LoggerFactory, PstContract, PstState, SmartWeave, SmartWeaveNodeFactory } from '@smartweave';
import path from 'path';

let arweave: Arweave;
let arlocal: ArLocal;
let smartweave: SmartWeave;
let pst: PstContract;

describe('Testing the Profit Sharing Token', () => {
  let contractSrc: string;

  let wallet: JWKInterface;
  let walletAddress: string;

  let initialState: PstState;

  beforeAll(async () => {
    arlocal = new ArLocal(1985, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1985,
      protocol: 'http'
    });

    LoggerFactory.INST.logLevel('error');

    smartweave = SmartWeaveNodeFactory.memCached(arweave);

    wallet = await arweave.wallets.generate();
    walletAddress = await arweave.wallets.jwkToAddress(wallet);

    contractSrc = fs.readFileSync(path.join(__dirname, 'data/token-pst.js'), 'utf8');
    const stateFromFile: PstState = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/token-pst.json'), 'utf8'));

    initialState = {
      ...stateFromFile,
      ...{
        balances: {
          ...stateFromFile.balances,
          [walletAddress]: 555669
        }
      }
    };

    // deploying contract using the new SDK.
    const contractTxId = await smartweave.createContract.deploy({
      wallet,
      initState: JSON.stringify(initialState),
      src: contractSrc
    });

    // connecting to the PST contract
    pst = smartweave.pst(contractTxId);

    // connecting wallet to the PST contract
    pst.connect(wallet);

    await mine();
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should read pst state and balance data', async () => {
    expect(await pst.currentState()).toEqual(initialState);
    /**
     * ArLocal currently does not support 'block' endpoint, which is required by interactRead / viewState
     */
    // expect(await pst.currentBalance('uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M')).toEqual(10000000);
    // expect(await pst.currentBalance('33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA')).toEqual(23111222);
    // expect(await pst.currentBalance(walletAddress)).toEqual(555669);
  });

  it('should properly transfer tokens', async () => {
    await pst.transfer({
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 555
    });

    await mine();

    expect((await pst.currentState()).balances[walletAddress]).toEqual(555669 - 555);
    expect((await pst.currentState()).balances['uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M']).toEqual(10000000 + 555);
  });

  /*
  note: ArLocal currently doest not support the "block" endpoint, which
  is required by the interactRead/viewState methods

  it('should properly view contract state', async () => {
    const result = await contract.viewState<any, number>({ function: 'value' });
    expect(result).toEqual(559);
  });*/
});

async function mine() {
  await arweave.api.get('mine');
}
