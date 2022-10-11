/* eslint-disable */
import {defaultCacheOptions, LoggerFactory, WarpFactory} from '../src';
import {JWKInterface} from "arweave/node/lib/wallet";
import fs from "fs";

LoggerFactory.INST.logLevel('error');

async function main() {
  const wallet: JWKInterface = JSON.parse(fs.readFileSync('./.secrets/33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA.json', "utf-8"));
  const warp = WarpFactory.forMainnet({...defaultCacheOptions, inMemory: true});
  const contract = warp.contract('Ws9hhYckc-zSnVmbBep6q_kZD5zmzYzDmgMC50nMiuE')
    .setEvaluationOptions({
      bundlerUrl: 'http://localhost:6666/'
    })
    .connect(wallet);
  await contract.writeInteraction({function: 'whatever'});
}

main().catch((e) => console.error(e));
