/* eslint-disable */
import Arweave from 'arweave';
import {defaultCacheOptions, defaultWarpGwOptions, LoggerFactory, WarpFactory} from '../src';
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
    const warp = WarpFactory
      .forMainnet({...defaultCacheOptions, inMemory: true})
      .useStateCache(new LmdbCache());
    /*const warp = WarpFactory
      .custom(arweave, {
        ...defaultCacheOptions,
        inMemory: true
      }, "mainnet")
      .useWarpGateway({
        ...defaultWarpGwOptions,
        address: "http://13.53.39.138:5666"
      })
      .build()*/
    //const contract = warp.contract("qx1z1YInqcp4Vf5amJER2R8E_SEyY6pmHS1912VSUAs");


    const jsContractSrc = fs.readFileSync(path.join(__dirname, 'data/js/token-pst.js'), 'utf8');
    const wasmContractSrc = fs.readFileSync(path.join(__dirname, 'data/rust/rust-pst_bg.wasm'));
    const initialState = fs.readFileSync(path.join(__dirname, 'data/js/token-pst.json'), 'utf8');

    // case 1 - full deploy, js contract
    /*const {contractTxId} = await warp.createContract.deploy({
      wallet,
      initState: initialState,
      src: jsContractSrc,
    });*/
    // case 2 - deploy from source, js contract
    /*const {contractTxId} = await warp.createContract.deployFromSourceTx({
      wallet,
      initState: initialState,
      srcTxId: "Hj0S0iK5rG8yVf_5u-usb9vRZg1ZFkylQLXu6rcDt-0",
    });*/

    // case 3 - full deploy, wasm contract
    /*const {contractTxId} = await warp.createContract.deploy({
      wallet,
      initState: initialState,
      src: wasmContractSrc,
      wasmSrcCodeDir: path.join(__dirname, 'data/rust/src'),
      wasmGlueCode: path.join(__dirname, 'data/rust/rust-pst.js')
    });*/

    // case 4 - deploy from source, wasm contract
    /*const {contractTxId} = await warp.createContract.deployFromSourceTx({
      wallet,
      initState: initialState,
      srcTxId: "5wXT-A0iugP9pWEyw-iTbB0plZ_AbmvlNKyBfGS3AUY",
    });*/

    const contract = warp.contract("RpyfKrvw7pCRgdJ-EML8jaZUH6eidDlhHACsShNYhEo")
      .setEvaluationOptions({
        bundlerUrl: "http://localhost:5666/"
      })
      .connect(wallet);

    await contract.writeInteraction({
      function: 'transfer',
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 55555
    });

   /* await contract.writeInteraction({
      function: 'transfer',
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 55555
    });

    await contract.writeInteraction({
      function: 'transfer',
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 55555
    });*/

    /*const {cachedValue} = await contract.readState();

    logger.info("Result", cachedValue.state);
    logger.info("Validity", cachedValue.validity);*/
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
