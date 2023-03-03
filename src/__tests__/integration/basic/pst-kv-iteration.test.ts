import fs from "fs";

import ArLocal from "arlocal";
import Arweave from "arweave";
import { JWKInterface } from "arweave/node/lib/wallet";
import path from "path";
import { mineBlock } from "../_helpers";
import { PstContract, PstState } from "../../../contract/PstContract";
import { Warp } from "../../../core/Warp";
import { DEFAULT_LEVEL_DB_LOCATION, WarpFactory } from "../../../core/WarpFactory";
import { LoggerFactory } from "../../../logging/LoggerFactory";
import { DeployPlugin } from "warp-contracts-plugin-deploy";
import { WriteInteractionResponse } from "../../../contract/Contract";

describe('Testing the Profit Sharing Token', () => {
  let contractSrc: string;

  let wallet: JWKInterface;
  let walletAddress: string;

  let initialState: PstState;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let warp: Warp;
  let pst: PstContract;
  let interaction: WriteInteractionResponse;

  let contractTxId;
  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(2224, false);
    await arlocal.start();
    LoggerFactory.INST.logLevel('error');

    warp = WarpFactory.forLocal(2224).use(new DeployPlugin());

    ({ arweave } = warp);
    ({ jwk: wallet, address: walletAddress } = await warp.generateWallet());

    contractSrc = fs.readFileSync(path.join(__dirname, '../data/kv-storage-range.js'), 'utf8');
    const stateFromFile: PstState = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/token-pst.json'), 'utf8'));

    initialState = {
      ...stateFromFile,
      ...{
        owner: walletAddress
      }
    };

    // deploying contract using the new SDK.
    ({ contractTxId } = await warp.deploy({
      wallet,
      initState: JSON.stringify(initialState),
      src: contractSrc
    }));

    // connecting to the PST contract
    pst = warp.pst(contractTxId).setEvaluationOptions({
      useKVStorage: true
    }) as PstContract;
    pst.connect(wallet);

    await mineBlock(warp);
  });

  afterAll(async () => {
    await arlocal.stop();
    fs.rmSync(`${DEFAULT_LEVEL_DB_LOCATION}/kv/ldb/${contractTxId}`, { recursive: true });
  });

  it('should initialize', async () => {
    // this is done to "initialize" the state
    await pst.writeInteraction({
      function: 'mint',
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 10000000
    });
    await mineBlock(warp);

    await pst.writeInteraction({
      function: 'mint',
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 1_000
    });
    await mineBlock(warp);

    await pst.writeInteraction({
      function: 'mint',
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 10_000
    });
    await mineBlock(warp);

    interaction = await pst.writeInteraction({
      function: 'mint',
      target: '33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA',
      qty: 23111222
    });
    await mineBlock(warp);

    await pst.writeInteraction({
      function: 'mint',
      target: walletAddress,
      qty: 555669
    });
    await mineBlock(warp);
  });

  it('should read pst state and balance data', async () => {
    expect(await pst.currentState()).toEqual(initialState);
    expect((await pst.currentBalance('uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M')).balance).toEqual(10_000);
    expect((await pst.currentBalance('33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA')).balance).toEqual(23111222);
    expect((await pst.currentBalance(walletAddress)).balance).toEqual(555669);
  });

  it('should properly transfer tokens', async () => {
    await pst.transfer({
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 555
    });

    await mineBlock(warp);
    await mineBlock(warp);

    await pst.transfer({
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 100
    });

    await mineBlock(warp);

    expect((await pst.currentBalance(walletAddress)).balance).toEqual(555669 - 655);
    expect((await pst.currentBalance('uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M')).balance).toEqual(10_000 + 655);
  });


  it('should properly check minted status', async () => {
    const viewResult = await pst.viewState<unknown, MintedResult>({ function: 'minted' });
    const interactionState = await pst.readState(interaction.originalTxId)
    console.log(interactionState);

    await mineBlock(warp);

    expect(viewResult.result.minted).toEqual(23676891);
  });

});

export interface MintedResult {
  minted: number;
}
