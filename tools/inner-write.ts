/* eslint-disable */
import Arweave from 'arweave';
import {
  Contract,
  defaultCacheOptions,
  LoggerFactory,
  SmartWeave,
  SmartWeaveFactory
} from '../src';
import { TsLogFactory } from '../src/logging/node/TsLogFactory';
import fs from 'fs';
import path from 'path';
import ArLocal from 'arlocal';
import { JWKInterface } from 'arweave/node/lib/wallet';
import {mineBlock} from "../src/__tests__/integration/_helpers";

async function main() {
  let callingContractSrc: string;
  let calleeContractSrc: string;
  let calleeInitialState: string;

  let wallet: JWKInterface;
  let walletAddress: string;

  let smartweave: SmartWeave;
  let calleeContract: Contract<any>;
  let callingContract: Contract;
  let calleeTxId;

  LoggerFactory.use(new TsLogFactory());
  LoggerFactory.INST.logLevel('debug');
  const logger = LoggerFactory.INST.create('inner-write');

  const arlocal = new ArLocal(1985, false);
  await arlocal.start();
  const arweave = Arweave.init({
    host: 'localhost',
    port: 1985,
    protocol: 'http'
  });

  const cacheDir = './cache/tools/'
  try {
    smartweave = SmartWeaveFactory.arweaveGw(arweave, {
      ...defaultCacheOptions,
      dbLocation: cacheDir
    });

    wallet = await arweave.wallets.generate();
    walletAddress = await arweave.wallets.jwkToAddress(wallet);
    await arweave.api.get(`/mint/${walletAddress}/1000000000000000`);

    callingContractSrc = fs.readFileSync(
      path.join(__dirname, '../src/__tests__/integration/', 'data/writing-contract.js'),
      'utf8'
    );
    calleeContractSrc = fs.readFileSync(
      path.join(__dirname, '../src/__tests__/integration/', 'data/example-contract.js'),
      'utf8'
    );

    // deploying contract using the new SDK.
    calleeTxId = await smartweave.createContract.deploy({
      wallet,
      initState: JSON.stringify({ counter: 0 }),
      src: calleeContractSrc
    });

    const callingTxId = await smartweave.createContract.deploy({
      wallet,
      initState: JSON.stringify({ ticker: 'WRITING_CONTRACT' }),
      src: callingContractSrc
    });

    calleeContract = smartweave.contract(calleeTxId).connect(wallet).setEvaluationOptions({
      ignoreExceptions: false,
      internalWrites: true,
    });
    callingContract = smartweave.contract(callingTxId).connect(wallet).setEvaluationOptions({
      ignoreExceptions: false,
      internalWrites: true
    });
    await mine();

    await calleeContract.writeInteraction({ function: 'add' });
    await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
    await mineBlock(arweave);

    await callingContract.writeInteraction({ function: 'writeContract', contractId: calleeTxId, amount: 10 });
    await mineBlock(arweave);

    logger.info('==== READ STATE  ====');
    const result2 = await calleeContract.readState();
    logger.info('Result (should be 21):', result2.state.counter);




  } finally {
    fs.rmSync(cacheDir, { recursive: true, force: true });
    await arlocal.stop();
  }

  async function mine() {
    await arweave.api.get('mine');
  }
}

main().catch((e) => console.error(e));
