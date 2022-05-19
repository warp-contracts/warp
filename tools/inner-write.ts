/* eslint-disable */
import Arweave from 'arweave';
import { Contract, LoggerFactory, Warp, WarpNodeFactory } from '../src';
import { TsLogFactory } from '../src/logging/node/TsLogFactory';
import fs from 'fs';
import path from 'path';
import ArLocal from 'arlocal';
import { JWKInterface } from 'arweave/node/lib/wallet';

async function main() {
  let callingContractSrc: string;
  let calleeContractSrc: string;
  let calleeInitialState: string;

  let wallet: JWKInterface;
  let walletAddress: string;

  let warp: Warp;
  let calleeContract: Contract<any>;
  let callingContract: Contract;
  let calleeTxId;

  LoggerFactory.use(new TsLogFactory());
  LoggerFactory.INST.logLevel('debug');
  //LoggerFactory.INST.logLevel('debug', 'HandlerBasedContract');
  /*LoggerFactory.INST.logLevel('debug', 'DefaultStateEvaluator');
  LoggerFactory.INST.logLevel('debug', 'CacheableStateEvaluator');
  LoggerFactory.INST.logLevel('debug', 'ContractHandler');
  LoggerFactory.INST.logLevel('debug', 'MemBlockHeightWarpCache');*/
  const logger = LoggerFactory.INST.create('inner-write');

  const arlocal = new ArLocal(1985, false);
  await arlocal.start();
  const arweave = Arweave.init({
    host: 'localhost',
    port: 1985,
    protocol: 'http'
  });

  try {
    warp = WarpNodeFactory.memCached(arweave);

    wallet = await arweave.wallets.generate();
    walletAddress = await arweave.wallets.jwkToAddress(wallet);

    callingContractSrc = fs.readFileSync(
      path.join(__dirname, '../src/__tests__/integration/', 'data/writing-contract.js'),
      'utf8'
    );
    calleeContractSrc = fs.readFileSync(
      path.join(__dirname, '../src/__tests__/integration/', 'data/example-contract.js'),
      'utf8'
    );

    // deploying contract using the new SDK.
    calleeTxId = await warp.createContract.deploy({
      wallet,
      initState: JSON.stringify({ counter: 100 }),
      src: calleeContractSrc
    });

    const callingTxId = await warp.createContract.deploy({
      wallet,
      initState: JSON.stringify({ ticker: 'WRITING_CONTRACT' }),
      src: callingContractSrc
    });

    calleeContract = warp.contract(calleeTxId).connect(wallet).setEvaluationOptions({
      ignoreExceptions: false,
      internalWrites: true,
    });
    callingContract = warp.contract(callingTxId).connect(wallet).setEvaluationOptions({
      ignoreExceptions: false,
      internalWrites: true
    });
    await mine();

    await calleeContract.writeInteraction({ function: 'add' });
    await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
    await mine(); // 113
    /*logger.info('==== READ STATE 1 ====');
    const result1 = await calleeContract.readState();
    logger.info('Read state 1', result1.state);*/

    await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
    await calleeContract.writeInteraction({ function: 'add' });
    await mine(); //124

    logger.info('==== READ STATE 2 ====');
    const result2 = await calleeContract.readState();
    logger.error('Read state 2', result2.state);

    /*await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
    await mine(); // 123

    logger.info('==== READ STATE 2 ====');
    const result2 = await calleeContract.readState();
    logger.info('Read state 2', result2.state);

    await calleeContract.writeInteraction({ function: 'add' });
    await mine(); // 124

    await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
    await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
    await calleeContract.writeInteraction({ function: 'add' });
    await mine(); // 145

    const result3 = await calleeContract.readState();
    logger.info('Read state 3', result3.state);*/


  } finally {
    await arlocal.stop();
  }

  async function mine() {
    await arweave.api.get('mine');
  }
}

main().catch((e) => console.error(e));
