/* eslint-disable */
import Arweave from 'arweave';
import {LoggerFactory, SmartWeaveNodeFactory} from '../src';
import {TsLogFactory} from '../src/logging/node/TsLogFactory';
import fs from 'fs';
import path from 'path';
import {JWKInterface} from 'arweave/node/lib/wallet';
import { readJSON } from '../../redstone-smartweave-examples/src/_utils';

async function main() {
  let wallet: JWKInterface = readJSON('../redstone-node/.secrets/redstone-jwk.json');;
  LoggerFactory.INST.logLevel('debug');
  const logger = LoggerFactory.INST.create('deploy');

  const arweave = Arweave.init({
    host: 'arweave.net',
    port: 443,
    protocol: 'https'
  });

  try {
    const smartweave = SmartWeaveNodeFactory
      .memCachedBased(arweave)
      .useRedStoneGateway(null, null, "http://localhost:5666")
      .build();

    const jsContractSrc = fs.readFileSync(path.join(__dirname, 'data/js/token-pst.js'), 'utf8');
    const wasmContractSrc = fs.readFileSync(path.join(__dirname, 'data/rust/rust-pst_bg.wasm'));
    const initialState = fs.readFileSync(path.join(__dirname, 'data/js/token-pst.json'), 'utf8');

    // case 1 - full deploy, js contract
   /* const contractTxId = await smartweave.createContract.deploy({
      wallet,
      initState: initialState,
      src: jsContractSrc,
    }, true);*/

    // case 2 - deploy from source, js contract
    /*const contractTxId = await smartweave.createContract.deployFromSourceTx({
      wallet,
      initState: initialState,
      srcTxId: "oB2CoWWJFRSoVV9_HN0h6z7iGIsGBXrkpNdPQ5HuEhw",
    }, true);*/

    // case 3 - full deploy, wasm contract
    /*const contractTxId = await smartweave.createContract.deploy({
      wallet,
      initState: initialState,
      src: wasmContractSrc,
      wasmSrcCodeDir: path.join(__dirname, 'data/rust/src'),
      wasmGlueCode: path.join(__dirname, 'data/rust/rust-pst.js')
    }, true);*/

    // case 4 - deploy from source, wasm contract
    const contractTxId = await smartweave.createContract.deployFromSourceTx({
      wallet,
      initState: initialState,
      srcTxId: "lg8-ERY_VuVKJb6EBDO5gmE93wJ72hZslSqWKMy66b0",
    }, true);

    const {state, validity} = await smartweave.contract(contractTxId).readState();

    logger.info("Result", state);

  } catch (e) {
    logger.error(e)

  }

}

main().catch((e) => console.error(e));
