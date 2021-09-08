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
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1986, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1986,
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
        owner: walletAddress,
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

    expect((await pst.currentBalance('uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M')).balance).toEqual(10000000);
    expect((await pst.currentBalance('33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA')).balance).toEqual(23111222);
    expect((await pst.currentBalance(walletAddress)).balance).toEqual(555669);
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

  it('should properly view contract state', async () => {
    const result = await pst.currentBalance('uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M');
    expect(result.balance).toEqual(10000000 + 555);
    expect(result.ticker).toEqual('EXAMPLE_PST_TOKEN');
    expect(result.target).toEqual('uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M');
  });

  it("should properly evolve contract's source code", async () => {
    expect((await pst.currentState()).balances[walletAddress]).toEqual(555114);

    const newSource = fs.readFileSync(path.join(__dirname, 'data/token-evolve.js'), 'utf8');

    const newSrcTxId = await pst.saveNewSource(newSource);
    await mine();

    await pst.evolve(newSrcTxId);
    await mine();

    // note: the evolved balance always adds 555 to the result
    expect((await pst.currentBalance(walletAddress)).balance).toEqual(555114 + 555);
  });
});

async function mine() {
  await arweave.api.get('mine');
}
