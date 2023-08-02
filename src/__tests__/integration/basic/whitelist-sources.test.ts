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

describe('Testing whitelist sources in nested contracts', () => {
  let contractSrc, foreignContractSrc: string;

  let wallet: JWKInterface;
  let walletAddress: string;

  let initialState: PstState;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let warp: Warp;
  let mainSrcTxId: string;
  let pst, pstWhitelisted, pstBlacklisted: PstContract;

  beforeAll(async () => {
    arlocal = new ArLocal(1900, false);
    await arlocal.start();
    LoggerFactory.INST.logLevel('error');
    warp = WarpFactory.forLocal(1900).use(new DeployPlugin());

    ({ arweave } = warp);
    ({ jwk: wallet, address: walletAddress } = await warp.generateWallet());

    contractSrc = fs.readFileSync(path.join(__dirname, '../data/token-pst.js'), 'utf8');
    const mainSrcTx = await warp.createSource({ src: contractSrc }, wallet);
    mainSrcTxId = await warp.saveSource(mainSrcTx);

    foreignContractSrc = fs.readFileSync(path.join(__dirname, '../data/token-pst-foreign.js'), 'utf8');
    const foreignSrcTx = await warp.createSource({ src: foreignContractSrc }, wallet);
    const foreignSrcTxId = await warp.saveSource(foreignSrcTx);

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

    pst = warp.pst(contractTxId) as PstContract;
    pst.connect(wallet);

    pstWhitelisted = warp.pst(contractTxId).setEvaluationOptions({
      whitelistSources: [mainSrcTxId]
    }) as PstContract;
    pstWhitelisted.connect(wallet);

    pstBlacklisted = warp.pst(contractTxId).setEvaluationOptions({
      whitelistSources: [foreignSrcTxId]
    }) as PstContract;
    pstBlacklisted.connect(wallet);
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should allow to evaluate contract by default', async () => {
    expect(await pst.readState()).toBeDefined();
  });

  it('should allow to evaluate contract when src tx id is in the whitelist', async () => {
    expect(await pstWhitelisted.readState()).toBeDefined();
  });

  it('should not allow to evaluate contract when src tx id is in the whitelist', async () => {
    await expect(pstBlacklisted.readState()).rejects.toThrowError(
      `[NonWhitelistedSourceError] Contract source not part of whitelisted sources list: ${mainSrcTxId}.`
    );
  });
});
