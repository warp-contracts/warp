/* eslint-disable */
import Arweave from 'arweave';
import {LoggerFactory, WARP_GW_URL, WarpGatewayInteractionsLoader} from '../src';
import {ArweaveGatewayInteractionsLoader} from '../src/core/modules/impl/ArweaveGatewayInteractionsLoader';
import {DefaultEvaluationOptions} from '../src/core/modules/StateEvaluator';

async function main() {
  LoggerFactory.INST.logLevel('debug');

  const arweave = Arweave.init({
    host: 'arweave.net', // Hostname or IP address for a Arweave host
    port: 443, // Port
    protocol: 'https', // Network protocol http or https
    timeout: 60000, // Network request timeouts in milliseconds
    logging: false // Enable network request logging
  });

  const arweaveLoader = new ArweaveGatewayInteractionsLoader(arweave, 'mainnet');
  const warpLoader = new WarpGatewayInteractionsLoader(WARP_GW_URL, {notCorrupted: true});

  const resultArweave = await arweaveLoader.load(
    'XIutiOKujGI21_ywULlBeyy-L9d8goHxt0ZyUayGaDg',
    null,
    null,
    {
      ...new DefaultEvaluationOptions(),
      includeBundledInteractions: true
    }
  );

  const resultWarp = await warpLoader.load(
    'XIutiOKujGI21_ywULlBeyy-L9d8goHxt0ZyUayGaDg',
    null,
    null,
    new DefaultEvaluationOptions()
  );

  console.log("all arweave", resultArweave.length);
  console.log("all warp", resultWarp.length);

  let arweaveFromArweave = 0;
  let arweaveFromSequencer = 0;

  let warpFromArweave = 0;
  let warpFromSequencer = 0;

  let missingSequencerTx = [];

  const arweaveSequencerTx = [];

  resultArweave.forEach(t => {
    if (t.tags.some(tg => tg.name === 'Sequencer')) {
      arweaveFromSequencer++;
      arweaveSequencerTx.push(t);
    } else {
      arweaveFromArweave++;
    }
  });

  resultWarp.forEach(t => {
    if (t.source === 'redstone-sequencer') {
      warpFromSequencer++;
      const txId = t.id;
      let found = false;

      for (const ast of arweaveSequencerTx) {
        if (ast.tags.some(tg => tg.name === 'Sequencer-Tx-Id' && tg.value === txId)) {
          arweaveFromSequencer++;
          arweaveSequencerTx.push(t);
          found = true;
          break;
        }
      }
      if (!found) {
        missingSequencerTx.push(txId);
      }
    } else {
      warpFromArweave++;
    }
  });

  console.log({
    arweaveFromArweave,
    warpFromArweave,
    arweaveFromSequencer,
    warpFromSequencer,
    "missing sequencer tx": missingSequencerTx.length
  });

  console.dir(missingSequencerTx, {depth: null});




}

main().catch((e) => console.error(e));
