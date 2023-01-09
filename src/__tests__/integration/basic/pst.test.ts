import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import path from 'path';
import { mineBlock } from '../_helpers';
import { PstState, PstContract } from '../../../contract/PstContract';
import { InteractionResult } from '../../../core/modules/impl/HandlerExecutorFactory';
import { Warp } from '../../../core/Warp';
import { WarpFactory } from '../../../core/WarpFactory';
import { LoggerFactory } from '../../../logging/LoggerFactory';

describe('Testing the Profit Sharing Token', () => {
  let contractSrc: string;

  let wallet: JWKInterface;
  let walletAddress: string;

  let initialState: PstState;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let warp: Warp;
  let pst: PstContract;
  let pstVM: PstContract;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1820, false);
    await arlocal.start();
    LoggerFactory.INST.logLevel('error');

    warp = WarpFactory.forLocal(1820);

    ({ arweave } = warp);
    ({ jwk: wallet, address: walletAddress } = await warp.generateWallet());

    contractSrc = fs.readFileSync(path.join(__dirname, '../data/token-pst.js'), 'utf8');
    const stateFromFile: PstState = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/token-pst.json'), 'utf8'));

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
    const { contractTxId } = await warp.createContract.deploy({
      wallet,
      initState: JSON.stringify(initialState),
      src: contractSrc
    });

    // connecting to the PST contract
    pst = warp.pst(contractTxId);
    pstVM = warp.pst(contractTxId).setEvaluationOptions({
      useVM2: true
    }) as PstContract;

    // connecting wallet to the PST contract
    pst.connect(wallet);
    pstVM.connect(wallet);

    await mineBlock(warp);
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should read pst state and balance data', async () => {
    expect(await pst.currentState()).toEqual(initialState);
    expect(await pstVM.currentState()).toEqual(initialState);

    expect((await pst.currentBalance('uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M')).balance).toEqual(10000000);
    expect((await pstVM.currentBalance('uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M')).balance).toEqual(10000000);
    expect((await pst.currentBalance('33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA')).balance).toEqual(23111222);
    expect((await pstVM.currentBalance('33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA')).balance).toEqual(23111222);
    expect((await pst.currentBalance(walletAddress)).balance).toEqual(555669);
    expect((await pstVM.currentBalance(walletAddress)).balance).toEqual(555669);
  });

  it('should properly transfer tokens', async () => {
    await pst.transfer({
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 555
    });

    await mineBlock(warp);

    expect((await pst.currentState()).balances[walletAddress]).toEqual(555669 - 555);
    expect((await pstVM.currentState()).balances[walletAddress]).toEqual(555669 - 555);
    expect((await pst.currentState()).balances['uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M']).toEqual(10000000 + 555);
    expect((await pstVM.currentState()).balances['uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M']).toEqual(
      10000000 + 555
    );
  });

  it('should properly view contract state', async () => {
    const result = await pst.currentBalance('uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M');
    const resultVM = await pst.currentBalance('uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M');
    expect(result.balance).toEqual(10000000 + 555);
    expect(resultVM.balance).toEqual(10000000 + 555);
    expect(result.ticker).toEqual('EXAMPLE_PST_TOKEN');
    expect(resultVM.ticker).toEqual('EXAMPLE_PST_TOKEN');
    expect(result.target).toEqual('uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M');
    expect(resultVM.target).toEqual('uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M');
  });

  it("should properly evolve contract's source code", async () => {
    expect((await pst.currentState()).balances[walletAddress]).toEqual(555114);
    expect((await pstVM.currentState()).balances[walletAddress]).toEqual(555114);

    const newSource = fs.readFileSync(path.join(__dirname, '../data/token-evolve.js'), 'utf8');

    const srcTx = await warp.createSourceTx({ src: newSource }, wallet);
    const newSrcTxId = await warp.saveSourceTx(srcTx);
    await mineBlock(warp);

    await pst.evolve(newSrcTxId);
    await mineBlock(warp);

    // note: the evolved balance always adds 555 to the result
    expect((await pst.currentBalance(walletAddress)).balance).toEqual(555114 + 555);
    expect((await pstVM.currentBalance(walletAddress)).balance).toEqual(555114 + 555);
  });

  it('should properly perform dry write with overwritten caller', async () => {
    const { jwk: newWallet, address: overwrittenCaller } = await warp.generateWallet();
    await pst.transfer({
      target: overwrittenCaller,
      qty: 1000
    });

    await mineBlock(warp);

    // note: transfer should be done from the "overwrittenCaller" address, not the "walletAddress"
    const result: InteractionResult<PstState, unknown> = await pst.dryWrite(
      {
        function: 'transfer',
        target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
        qty: 333
      },
      overwrittenCaller
    );

    expect(result.state.balances[walletAddress]).toEqual(555114 - 1000);
    expect(result.state.balances['uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M']).toEqual(10000000 + 555 + 333);
    expect(result.state.balances[overwrittenCaller]).toEqual(1000 - 333);
  });

  describe('when in strict mode', () => {
    it('should properly extract owner from signature, using arweave wallet', async () => {
      const startBalance = (await pst.currentBalance(walletAddress)).balance;

      await pst.writeInteraction(
        {
          function: 'transfer',
          target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
          qty: 100
        },
        { strict: true }
      );

      expect((await pst.currentBalance(walletAddress)).balance).toEqual(startBalance - 100);
    });
  });
});
