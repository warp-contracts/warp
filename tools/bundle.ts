/* eslint-disable */
import Arweave from 'arweave';
import {
  LoggerFactory,
  MemCache,
  RedstoneGatewayContractDefinitionLoader,
  RedstoneGatewayInteractionsLoader, sleep,
  SmartWeaveNodeFactory, SmartWeaveTags
} from '../src';
import { readJSON } from '../../redstone-smartweave-examples/src/_utils';
import { TsLogFactory } from '../src/logging/node/TsLogFactory';

const logger = LoggerFactory.INST.create('Contract');

//LoggerFactory.use(new TsLogFactory());
LoggerFactory.INST.logLevel('error');
LoggerFactory.INST.logLevel('info', 'Contract');
LoggerFactory.INST.logLevel('error', 'RedstoneGatewayInteractionsLoader');
LoggerFactory.INST.logLevel('error', 'DefaultStateEvaluator');
LoggerFactory.INST.logLevel('error', 'LexicographicalInteractionsSorter');

async function main() {
  const arweave = Arweave.init({
    host: 'arweave.net', // Hostname or IP address for a Arweave host
    port: 443, // Port
    protocol: 'https', // Network protocol http or https
    timeout: 60000, // Network request timeouts in milliseconds
    logging: false // Enable network request logging
  });

  const redstoneLoader = new RedstoneGatewayInteractionsLoader('http://localhost:5666', {notCorrupted: true});

  const smartweave = SmartWeaveNodeFactory.memCachedBased(arweave)
    .setInteractionsLoader(redstoneLoader)
    .setDefinitionLoader(
      new RedstoneGatewayContractDefinitionLoader('http://localhost:5666', arweave, new MemCache())
    )
    .build();

  const jwk = readJSON('../redstone-node/.secrets/redstone-jwk.json');
  // connecting to a given contract
  const token = smartweave
    .contract("_IHQHkZrZfB3lN69Hw3xTRcHv2cBiNgh1HG1WENydP4")
    .setEvaluationOptions({
      sequencerAddress: "http://localhost:5666/"
    })
    // connecting wallet to a contract. It is required before performing any "writeInteraction"
    // calling "writeInteraction" without connecting to a wallet first will cause a runtime error.
    .connect(jwk);

  const result = await token.writeInteraction({
    function: "transfer",
    target: "33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA",
    qty: 10
  }, [{
    name: SmartWeaveTags.INTERACT_WRITE,
    value: "33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA"
  },{
    name: SmartWeaveTags.INTERACT_WRITE,
    value: "4MnaOd-GvsE5iVQD4OhdY8DOrH3vo0QEqOw31HeIzQ0"
  }
  ]);

  console.log(result);

  //console.log(await redstoneLoader.load("33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA", 0, 1_000_000));


  // UjZsNC0t5Ex7TjU8FIGLZcn_b3Af9OoNBuVmTAgp2_U
  /*const result1 = await token.readState();

  console.log(result1.state);
  console.log(token.lastReadStateStats());*/

  //logger.info("Amount of computed interactions before 'bundleInteraction':", Object.keys(result1.validity).length);

  /*for (let i = 0 ; i < 1100 ; i++) {
    console.log(`mint ${i + 1}`);
    try {
      const result = await token.bundleInteraction<any>({
        function: "transfer",
        target: "33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA",
        qty: 10
      });
    } catch(e:any) {

    }
    //await sleep(1);
  }*/



  /*logger.info("Result from the sequencer", result);

  // the new transaction is instantly available - ie. during the state read operation
  const result2 = await token.readState();

  logger.info("Amount of computed interactions after 'bundleInteraction':", Object.keys(result2.validity).length);
*/
}


main().catch((e) => console.error(e));
