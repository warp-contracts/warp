/* eslint-disable */
const Arweave = require('arweave');
const { LoggerFactory } = require('../lib/cjs/logging/LoggerFactory');
const {SmartWeaveNodeFactory} = require("../lib/cjs/core/node/SmartWeaveNodeFactory");

const logger = LoggerFactory.INST.create('Contract');

//LoggerFactory.use(new TsLogFactory());
LoggerFactory.INST.logLevel('debug');


async function main() {
  const arweave = Arweave.init({
    host: 'testnet.redstone.tools',
    protocol: 'https',
    port: 443,
  });

  const sdk = SmartWeaveNodeFactory.memCachedBased(arweave).useArweaveGateway().build();

  const {state, validity} = await sdk.contract("FpxHKa7ipPv2dUTWg9Z3fiEdc_i_zRYpZLGj15kG3JM").readState();

  console.log(state);
}

main().catch((e) => console.error(e));
