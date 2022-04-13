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
      .useRedStoneGateway()
      .build();

    const {state, validity} = await smartweave.contract("pvudp_Wp8NMDJR6KUsQbzJJ27oLO4fAKXsnVQn86JbU").readState();

    logger.info("Result", state);

  } catch (e) {
    logger.error(e)

  }

}

main().catch((e) => console.error(e));
