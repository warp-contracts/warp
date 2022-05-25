/* eslint-disable */
const Arweave = require('arweave');
const { LoggerFactory } = require('../lib/cjs/logging/LoggerFactory');
const { RedstoneGatewayInteractionsLoader } = require('../lib/cjs/core/modules/impl/RedstoneGatewayInteractionsLoader');
const {TsLogFactory} = require('../lib/cjs/logging/node/TsLogFactory');
const fs = require('fs');
const path =require('path');
const {readContract} = require("smartweave");
const {SmartWeaveNodeFactory} = require("../lib/cjs/core/node/SmartWeaveNodeFactory");
const {ContractDefinitionLoader} = require("../src");
const {load} = require("cheerio");

const logger = LoggerFactory.INST.create('Contract');

//LoggerFactory.use(new TsLogFactory());
LoggerFactory.INST.logLevel('info');


async function main() {
  const arweave = Arweave.init({
    host: 'testnet.redstone.tools',
    protocol: 'https',
    port: 443,
  });

  const loader = new ContractDefinitionLoader(arweave);
  const definition = await loader.load("contract_tx_id");
  console.log(definition.srcTxId);
  /*const result = await SmartWeaveNodeFactory
      .memCached(arweave)
      .contract("dKR4CTZUei9Q7L0n37WXs8pOOMP-WOyg0_2DSprdag4")
      .readState();*/

  const result = await readContract(arweave, "dKR4CTZUei9Q7L0n37WXs8pOOMP-WOyg0_2DSprdag4");

  console.log(result);
}

main().catch((e) => console.error(e));
