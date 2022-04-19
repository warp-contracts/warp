/* eslint-disable */
import Arweave from 'arweave';
import {LoggerFactory, SmartWeaveNodeFactory} from '../src';
import {TsLogFactory} from '../src/logging/node/TsLogFactory';
import fs from 'fs';
import path from 'path';
import {JWKInterface} from 'arweave/node/lib/wallet';

async function main() {
  let wallet: JWKInterface = readJSON('./.secrets/33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA.json');;
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
      .useRedStoneGateway()
      .build();

    const jsContractSrc = fs.readFileSync(path.join(__dirname, 'data/js/token-pst.js'), 'utf8');
    const wasmContractSrc = fs.readFileSync(path.join(__dirname, 'data/rust/rust-pst_bg.wasm'));
    const initialState = fs.readFileSync(path.join(__dirname, 'data/js/token-pst.json'), 'utf8');

    // case 1 - full deploy, js contract
    const contractTxId = await smartweave.createContract.deploy({
      wallet,
      initState: initialState,
      src: jsContractSrc,
    }, true);

    // case 2 - deploy from source, js contract
    /*const contractTxId = await smartweave.createContract.deployFromSourceTx({
      wallet,
      initState: initialState,
      srcTxId: "Hj0S0iK5rG8yVf_5u-usb9vRZg1ZFkylQLXu6rcDt-0",
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
    /*const contractTxId = await smartweave.createContract.deployFromSourceTx({
      wallet,
      initState: initialState,
      srcTxId: "5wXT-A0iugP9pWEyw-iTbB0plZ_AbmvlNKyBfGS3AUY",
    }, true);*/

    const {state, validity} = await smartweave.contract(contractTxId).readState();

    //logger.info("Result", state);

  } catch (e) {
    logger.error(e)

  }

}

export function readJSON(path: string): JWKInterface {
  const content = fs.readFileSync(path, "utf-8");
  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error(`File "${path}" does not contain a valid JSON`);
  }
}

main().catch((e) => console.error(e));
