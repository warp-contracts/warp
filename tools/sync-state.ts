/* eslint-disable */
import Arweave from 'arweave';
import {LoggerFactory, SmartWeaveNodeFactory} from '../src';
import fs from 'fs';
import {JWKInterface} from 'arweave/node/lib/wallet';
import {TsLogFactory} from "../src/logging/node/TsLogFactory";

async function main() {
  LoggerFactory.use(new TsLogFactory());
  LoggerFactory.INST.logLevel('info');
  const logger = LoggerFactory.INST.create('den');

  const arweave = Arweave.init({
    host: 'arweave.net',
    port: 443,
    protocol: 'https'
  });

  try {
    const contract = await SmartWeaveNodeFactory.memCached(arweave)
      .contract("XIutiOKujGI21_ywULlBeyy-L9d8goHxt0ZyUayGaDg")
      .syncState("http://134.209.84.136:8080");

    const call = await contract
      .viewState({
        function: "owner",
        tokenId: "N44xR9fFg98mHmdIA8cOyHA19qNDmT4Xbd8dww8KSDk"
      });

    logger.info(call.result);

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
