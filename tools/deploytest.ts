/* eslint-disable */
import Arweave from 'arweave';
import {Benchmark, defaultCacheOptions, defaultWarpGwOptions, LoggerFactory, WarpFactory} from '../src';
import fs from 'fs';
import path from 'path';
import {JWKInterface} from 'arweave/node/lib/wallet';

async function main() {
  let wallet: JWKInterface = readJSON('./.secrets/33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA.json');
  LoggerFactory.INST.logLevel('error');
  //LoggerFactory.INST.logLevel('debug', 'ExecutionContext');
  const logger = LoggerFactory.INST.create('deploy');

  const arweave = Arweave.init({
    host: 'arweave.net',
    port: 443,
    protocol: 'https'
  });

  try {
    const cacheOptions = {...defaultCacheOptions, inMemory: true}
    const warp = WarpFactory
      .custom(arweave, cacheOptions, 'mainnet')
      .useWarpGateway({...defaultWarpGwOptions, address: 'http://34.96.77.111'}, cacheOptions)
      .build();

    const jsContractSrc = fs.readFileSync(path.join(__dirname, 'data/js/token-pst.js'), 'utf8');
    const initialState = fs.readFileSync(path.join(__dirname, 'data/js/token-pst.json'), 'utf8');

    // case 1 - full deploy, js contract
    const {contractTxId, srcTxId} = await warp.deploy({
      wallet,
      initState: initialState,
      src: jsContractSrc
    });

    console.log('contractTxId:', contractTxId);
    console.log('srcTxId:', srcTxId);

    const contract = warp.contract<any>(contractTxId)
      .setEvaluationOptions({internalWrites: true, unsafeClient: 'skip', sequencerUrl: 'http://34.96.77.111/'})
      .connect(wallet);


    const benchmark = Benchmark.measure();
    await Promise.all([
      contract.writeInteraction<any>({
        function: "transfer",
        target: "M-mpNeJbg9h7mZ-uHaNsa5jwFFRAq0PsTkNWXJ-ojwI",
        qty: 100
      }),

    ]);

    console.log("Total", benchmark.elapsed());

    /*const {cachedValue} = await contract.readState();

    logger.info("Result");
    console.dir(cachedValue.state);*/

  } catch (e) {
    //logger.error(e)
    throw e;

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
