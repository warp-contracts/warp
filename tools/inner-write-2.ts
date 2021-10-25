/* eslint-disable */
import Arweave from 'arweave';
import { Contract, LoggerFactory, SmartWeave, SmartWeaveNodeFactory } from '../src';
import { TsLogFactory } from '../src/logging/node/TsLogFactory';
import fs from 'fs';
import path from 'path';
import ArLocal from 'arlocal';
import { JWKInterface } from 'arweave/node/lib/wallet';

async function main() {
  let contractASrc: string;
  let contractAInitialState: string;
  let contractBSrc: string;
  let contractBInitialState: string;

  let wallet: JWKInterface;
  let walletAddress: string;

  let smartweave: SmartWeave;
  let contractA: Contract<any>;
  let contractB: Contract<any>;
  let contractC: Contract<any>;
  let contractATxId;
  let contractBTxId;
  let contractCTxId;

  LoggerFactory.use(new TsLogFactory());
 LoggerFactory.INST.logLevel('error');
  /*
   LoggerFactory.INST.logLevel('debug', 'HandlerBasedContract');
   LoggerFactory.INST.logLevel('debug', 'DefaultStateEvaluator');
   LoggerFactory.INST.logLevel('debug', 'CacheableStateEvaluator');
   LoggerFactory.INST.logLevel('debug', 'ContractHandler');
   LoggerFactory.INST.logLevel('debug', 'MemBlockHeightSwCache');
 */  const logger = LoggerFactory.INST.create('inner-write');

  const arlocal = new ArLocal(1982, false);
  await arlocal.start();
  const arweave = Arweave.init({
    host: 'localhost',
    port: 1982,
    protocol: 'http'
  });

  try {
    smartweave = SmartWeaveNodeFactory.memCached(arweave);

    wallet = await arweave.wallets.generate();

    contractASrc = fs.readFileSync(path.join(__dirname,'../src/__tests__/integration/', 'data/writing-contract.js'), 'utf8');
    contractAInitialState = fs.readFileSync(path.join(__dirname, '../src/__tests__/integration/', 'data/writing-contract-state.json'), 'utf8');
    contractBSrc = fs.readFileSync(path.join(__dirname, '../src/__tests__/integration/', 'data/example-contract.js'), 'utf8');
    contractBInitialState = fs.readFileSync(path.join(__dirname, '../src/__tests__/integration/', 'data/example-contract-state.json'), 'utf8');

    contractATxId = await smartweave.createContract.deploy({
      wallet,
      initState: contractAInitialState,
      src: contractASrc
    });

    contractBTxId = await smartweave.createContract.deploy({
      wallet,
      initState: contractBInitialState,
      src: contractBSrc
    });

    contractCTxId = await smartweave.createContract.deploy({
      wallet,
      initState: JSON.stringify({ counter: 200 }),
      src: contractBSrc
    });

    contractA = smartweave.contract(contractATxId).connect(wallet);
    contractB = smartweave.contract(contractBTxId).connect(wallet);
    contractC = smartweave.contract(contractCTxId).connect(wallet);

    await mine();

    await contractA.writeInteraction({
      function: 'writeBack',
      contractId: contractBTxId,
      amount: 100
    });
    await mine();

    //console.log(await contractA.readState());
    //console.log(await contractB.readState());


  } finally {
    await arlocal.stop();
  }

  async function mine() {
    await arweave.api.get('mine');
  }
}

main().catch((e) => console.error(e));
