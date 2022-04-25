/* eslint-disable */
import Arweave from 'arweave';
import {LoggerFactory, SmartWeaveNodeFactory} from '../src';
import fs from 'fs';
import {JWKInterface} from 'arweave/node/lib/wallet';

async function main() {
  LoggerFactory.INST.logLevel('info');
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

    const contract = await smartweave.contract("qg5BIOUraunoi6XJzbCC-TgIAypcXyXlVprgg0zRRDE")
      .syncState("http://134.209.84.136:8080");

    const result = await contract
      .viewState({
        function: "getNodeDetails", data: {
          address: "33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA"
        }
      });

    logger.info("Result", result);

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
