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

describe('Testing sources whitelisting in nested contracts (write)', () => {
  let contractSrc, foreignContractSrc: string;

  let wallet: JWKInterface;
  let walletAddress: string;

  let initialState: PstState;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let warp, warpBlacklisted: Warp;
  let pst, foreignWhitelistedPst, foreignBlacklistedPst: PstContract;
  let contractTxId,
    foreignBlacklistedContractTxId,
    foreignBlacklistedSrcTxId,
    foreignWhitelistedContractTxId,
    foreignWhitelistedSrcTxId;

  beforeAll(async () => {
    arlocal = new ArLocal(1902, false);
    await arlocal.start();
    LoggerFactory.INST.logLevel('error');
    warp = WarpFactory.forLocal(1902).use(new DeployPlugin());
    warpBlacklisted = WarpFactory.forLocal(1902).use(new DeployPlugin());

    ({ arweave } = warp);
    ({ jwk: wallet, address: walletAddress } = await warp.generateWallet());

    contractSrc = fs.readFileSync(path.join(__dirname, '../data/token-pst.js'), 'utf8');
    const srcTx = await warp.createSource({ src: contractSrc }, wallet);
    const srcTxId = await warp.saveSource(srcTx);

    foreignContractSrc = fs.readFileSync(path.join(__dirname, '../data/token-pst-foreign.js'), 'utf8');
    const foreignBlacklistContractSrcTx = await warp.createSource({ src: foreignContractSrc }, wallet);
    foreignBlacklistedSrcTxId = await warp.saveSource(foreignBlacklistContractSrcTx);
    const foreignWhitelistSrcTx = await warp.createSource({ src: foreignContractSrc }, wallet);
    foreignWhitelistedSrcTxId = await warp.saveSource(foreignWhitelistSrcTx);

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

    ({ contractTxId } = await warp.deployFromSourceTx({
      wallet,
      initState: JSON.stringify(initialState),
      srcTxId
    }));

    ({ contractTxId: foreignBlacklistedContractTxId } = await warp.deployFromSourceTx({
      wallet,
      initState: JSON.stringify(initialState),
      srcTxId: foreignBlacklistedSrcTxId
    }));

    ({ contractTxId: foreignWhitelistedContractTxId } = await warp.deployFromSourceTx({
      wallet,
      initState: JSON.stringify(initialState),
      srcTxId: foreignWhitelistedSrcTxId
    }));

    pst = warp.pst(contractTxId).setEvaluationOptions({
      internalWrites: true,
      whitelistSources: [srcTxId, foreignWhitelistedSrcTxId]
    }) as PstContract;
    pst.connect(wallet);

    foreignWhitelistedPst = warp
      .pst(foreignWhitelistedContractTxId)
      .setEvaluationOptions({
        internalWrites: true
      })
      .connect(wallet) as PstContract;

    foreignBlacklistedPst = warpBlacklisted
      .pst(foreignBlacklistedContractTxId)
      .setEvaluationOptions({
        internalWrites: true
      })
      .connect(wallet) as PstContract;
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

  it('should properly perform write from foreign whitelisted contract', async () => {
    await foreignWhitelistedPst.writeInteraction({
      function: 'writeForeign',
      contractTxId: contractTxId
    });

    const result = await pst.readState();
    expect((result.cachedValue.state as any).foreignCallsCounter).toEqual(1);
  });

  it('should block write from foreign blacklisted contract (1)', async () => {
    const blacklistedWriteTx = await foreignBlacklistedPst.writeInteraction({
      function: 'writeForeign',
      contractTxId: contractTxId
    });

    const result = await pst.readState();
    expect(result.cachedValue.validity[blacklistedWriteTx.originalTxId]).toBeFalsy();
    // should not change from previous test
    expect((result.cachedValue.state as any).foreignCallsCounter).toEqual(1);
  });

  it('should block write from foreign blacklisted contract (2)', async () => {
    const blacklistedWriteTx = await foreignBlacklistedPst.writeInteraction({
      function: 'writeForeign',
      contractTxId: contractTxId
    });

    const result = await pst.readState();
    expect(result.cachedValue.validity[blacklistedWriteTx.originalTxId]).toBeFalsy();
    // should not change from previous test
    expect((result.cachedValue.state as any).foreignCallsCounter).toEqual(1);
  });

  it('should block write from foreign whitelisted contract that evolved to blacklisted', async () => {
    const srcTx = await warp.createSource({ src: foreignContractSrc }, wallet);
    const nonWhitelistedSrcTxId = await warp.saveSource(srcTx);

    await foreignWhitelistedPst.evolve(nonWhitelistedSrcTxId);

    const blacklistedWriteTx = await foreignWhitelistedPst.writeInteraction({
      function: 'writeForeign',
      contractTxId: contractTxId
    });

    const result = await pst.readState();
    expect(result.cachedValue.validity[blacklistedWriteTx.originalTxId]).toBeFalsy();
    // should not change from previous test
    expect((result.cachedValue.state as any).foreignCallsCounter).toEqual(1);
  });
});
