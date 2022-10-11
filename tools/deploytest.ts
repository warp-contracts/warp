/* eslint-disable */
import Arweave from 'arweave';
import {defaultCacheOptions, LoggerFactory, WarpFactory} from '../src';
import fs from 'fs';
import path from 'path';
import {JWKInterface} from 'arweave/node/lib/wallet';
import Transaction from "arweave/node/lib/transaction";

async function main() {
  let wallet: JWKInterface = readJSON('./.secrets/33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA.json');
  ;
  LoggerFactory.INST.logLevel('debug');
  const logger = LoggerFactory.INST.create('deploy');

  const arweave = Arweave.init({
    host: 'arweave.net',
    port: 443,
    protocol: 'https'
  });

  try {
    const warp = WarpFactory.forMainnet({...defaultCacheOptions, inMemory: false});
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

    /*// case 1 - full deploy, js contract
    const {contractTxId, srcTxId} = await warp.createContract.deploy({
      wallet,
      initState: initialState,
      src: jsContractSrc,
    });

    console.log(srcTxId);*/

    // case 2 - deploy from source, js contract
    const result = await warp.createContract.deployFromSourceTx({
      wallet,
      initState: initialState,
      srcTxId: "h8xDd2vFxrsLpqWKYD0bn4J1wnnN65cSnAkSuieG8ME",
      tags: [{
        name: 'ppe-foo',
        value: 'ppe-bar'
      }]
    });
    console.log("New contract tx", result.contractTxId);

    const response = await fetch(`https://gateway.redstone.finance/gateway/contract?txId=${result.contractTxId}`);
    const contractTx = new Transaction((await response.json()).contractTx);
    let allTags = [];
    // @ts-ignore
    contractTx.get("tags").forEach((tag) => {
      let key = tag.get("name", {decode: true, string: true});
      let value = tag.get("value", {decode: true, string: true});
      allTags.push({key, value,});
    });
    console.dir(allTags, {depth: null});

    /*const def = await warp.definitionLoader.load("lcKAr6rAtqAJkEAD6kt72Nz4g9X4qlqKHOIzMSiCtlI");
    console.log(def.)*/

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

    /*const contract = warp.contract(contractTxId)
      /!*.setEvaluationOptions({
        bundlerUrl: "http://13.53.39.138:5666/"
      })*!/
      .connect(wallet);

    await contract.writeInteraction<any>({
      function: "storeBalance",
      target: "M-mpNeJbg9h7mZ-uHaNsa5jwFFRAq0PsTkNWXJ-ojwI",
    });

    await contract.writeInteraction<any>({
      function: "storeBalance",
      target: "M-mpNeJbg9h7mZ-uHaNsa5jwFFRAq0PsTkNWXJ-ojwI",
    });

    await contract.writeInteraction<any>({
      function: "storeBalance",
      target: "M-mpNeJbg9h7mZ-uHaNsa5jwFFRAq0PsTkNWXJ-ojwI",
    });

    const {cachedValue} = await contract.readState();

    logger.info("Result", cachedValue.state);
    logger.info("Validity", cachedValue.validity);

    const result2 = await contract.readState();*/

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
