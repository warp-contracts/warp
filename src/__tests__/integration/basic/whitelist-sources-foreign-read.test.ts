import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import path from 'path';
import { PstContract, PstState } from '../../../contract/PstContract';
import { Warp } from '../../../core/Warp';
import { WarpFactory } from '../../../core/WarpFactory';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { DeployPlugin } from 'warp-contracts-plugin-deploy';

describe('Testing sources whitelisting in nested contracts (read)', () => {
  let contractSrc: string;
  let foreignSrc: string;

  let wallet: JWKInterface;
  let walletAddress: string;

  let initialState: PstState;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let warp: Warp;
  let pst, blacklistPst, whitelistPst: PstContract;
  let blacklistSrcTxId: string;
  let foreignWhitelistTxId, foreignBlacklistTxId: string;

  beforeAll(async () => {
    arlocal = new ArLocal(1901, false);
    await arlocal.start();
    LoggerFactory.INST.logLevel('debug');
    warp = WarpFactory.forLocal(1901).use(new DeployPlugin());

    ({ arweave } = warp);
    ({ jwk: wallet, address: walletAddress } = await warp.generateWallet());

    contractSrc = fs.readFileSync(path.join(__dirname, '../data/token-pst.js'), 'utf8');
    const mainSrcTx = await warp.createSource({ src: contractSrc }, wallet);
    const mainSrcTxId = await warp.saveSource(mainSrcTx);

    foreignSrc = fs.readFileSync(path.join(__dirname, '../data/token-pst-foreign.js'), 'utf8');
    const blacklistContractSrcTx = await warp.createSource({ src: foreignSrc }, wallet);
    blacklistSrcTxId = await warp.saveSource(blacklistContractSrcTx);
    const whitelistSrcTx = await warp.createSource({ src: foreignSrc }, wallet);
    const whitelistSrcTxId = await warp.saveSource(whitelistSrcTx);

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

    const { contractTxId } = await warp.deployFromSourceTx({
      wallet,
      initState: JSON.stringify(initialState),
      srcTxId: mainSrcTxId
    });

    ({ contractTxId: foreignWhitelistTxId } = await warp.deployFromSourceTx({
      wallet,
      initState: JSON.stringify(initialState),
      srcTxId: whitelistSrcTxId
    }));

    ({ contractTxId: foreignBlacklistTxId } = await warp.deployFromSourceTx({
      wallet,
      initState: JSON.stringify(initialState),
      srcTxId: blacklistSrcTxId
    }));

    pst = warp.pst(contractTxId).setEvaluationOptions({
      whitelistSources: [mainSrcTxId, whitelistSrcTxId]
    }) as PstContract;
    pst.connect(wallet);

    blacklistPst = warp.pst(foreignBlacklistTxId).connect(wallet) as PstContract;

    whitelistPst = warp.pst(foreignWhitelistTxId).connect(wallet) as PstContract;
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should properly transfer tokens', async () => {
    await pst.transfer({
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 555
    });

    expect((await pst.currentState()).balances[walletAddress]).toEqual(555669 - 555);
    expect((await pst.currentState()).balances['uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M']).toEqual(10000000 + 555);
  });

  it('should properly read foreign contract with whitelisted source', async () => {
    await whitelistPst.transfer({
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 555
    });

    const { originalTxId } = await pst.writeInteraction({
      function: 'readForeign',
      contractTxId: foreignWhitelistTxId
    });

    const result = await pst.readState();
    expect(result.cachedValue.validity[originalTxId]).toBe(true);
    expect((result.cachedValue.state as any).foreignCallsCounter).toEqual(1);
  });

  it('should stop evaluation of a contract which is not in the whitelist (readContractState)', async () => {
    const readBlacklistedTx = await pst.writeInteraction({
      function: 'readForeign',
      contractTxId: foreignBlacklistTxId
    });

    const result = await pst.readState();

    expect(Object.keys(result.cachedValue.validity).length == 2);
    expect(Object.keys(result.cachedValue.errorMessages).length == 2);

    expect(result.cachedValue.validity[readBlacklistedTx.originalTxId]).toBe(false);
    expect(result.cachedValue.errorMessages[readBlacklistedTx.originalTxId]).toMatch(
      `Contract source not part of whitelisted sources list: ${blacklistSrcTxId}.`
    );

    // should not change from previous test
    expect((result.cachedValue.state as any).foreignCallsCounter).toEqual(1);
  });

  it('should skip evaluation when foreign whitelisted contract evolves to non-whitelisted source (readContractState)', async () => {
    const readWhitelistedTx = await pst.writeInteraction({
      function: 'readForeign',
      contractTxId: foreignWhitelistTxId
    });

    await whitelistPst.evolve(blacklistSrcTxId);

    await whitelistPst.transfer({
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 555
    });

    const readEvolvedBlacklistTx = await pst.writeInteraction({
      function: 'readForeign',
      contractTxId: foreignWhitelistTxId
    });

    const lastWrittenTx = await pst.transfer({
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 555
    });

    const result = await pst.readState();
    expect(result.cachedValue.validity[readWhitelistedTx.originalTxId]).toBe(true);
    expect(result.cachedValue.validity[readEvolvedBlacklistTx.originalTxId]).toBe(false);

    // note: the transactions after foreign read from evolved to unsafe contract should be processed normally
    expect(result.cachedValue.validity[lastWrittenTx.originalTxId]).toBe(true);

    // should be incremented by one - only the first read from this testcase should be successful
    expect((result.cachedValue.state as any).foreignCallsCounter).toEqual(2);
  });
});
