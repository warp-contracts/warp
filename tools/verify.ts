/* eslint-disable */
import { defaultCacheOptions, LoggerFactory, WarpFactory } from '../src';
import fs from 'fs';
import path from 'path';
import { JWKInterface } from 'arweave/node/lib/wallet';

async function main() {
  let wallet: JWKInterface = readJSON('./.secrets/33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA.json');
  LoggerFactory.INST.logLevel('debug');
  const logger = LoggerFactory.INST.create('verify');

  try {
    const warp = WarpFactory.forMainnet({ ...defaultCacheOptions, inMemory: true });

    const jsContractSrc = fs.readFileSync(path.join(__dirname, 'dist/verify.js'), 'utf8');
    const initialState = fs.readFileSync(path.join(__dirname, 'data/js/verify.json'), 'utf8');

    const { contractTxId } = await warp.createContract.deploy({
      wallet,
      initState: initialState,
      src: jsContractSrc
    });

    console.log(contractTxId);

    const contract = warp.contract<any>(contractTxId).connect(wallet)
      .setEvaluationOptions({ allowBigInt: true, useVM2: false });

    await Promise.all([
      contract.writeInteraction<any>({
        function: 'arweave'
      }),

    ]);

    const { cachedValue } = await contract.readState();

    logger.info('Result');
    console.dir(cachedValue.state);
  } catch (e) {
    logger.error(e);
  }
}

export function readJSON(path: string): JWKInterface {
  const content = fs.readFileSync(path, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error(`File "${path}" does not contain a valid JSON`);
  }
}

main().catch((e) => console.error(e));
