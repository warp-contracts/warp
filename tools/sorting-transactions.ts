/* eslint-disable */
import Arweave from 'arweave';
import {
  ArweaveGatewayInteractionsLoader,
  BlockHeightInteractionsSorter,
  Contract, DefaultEvaluationOptions, LexicographicalInteractionsSorter,
  LoggerFactory,
  SmartWeave,
  SmartWeaveNodeFactory
} from '../src';
import {TsLogFactory} from '../src/logging/node/TsLogFactory';
import fs from 'fs';
import path from 'path';
import ArLocal from 'arlocal';
import {JWKInterface} from 'arweave/node/lib/wallet';

async function main() {
  let contractSrc: string;
  let wallet: JWKInterface;
  let smartweave: SmartWeave;

  LoggerFactory.use(new TsLogFactory());
  LoggerFactory.INST.logLevel('error');
  LoggerFactory.INST.logLevel('info', 'sorting');
  const logger = LoggerFactory.INST.create('sorting');

  const arlocal = new ArLocal(1985, false);
  await arlocal.start();
  const arweave = Arweave.init({
    host: 'localhost',
    port: 1985,
    protocol: 'http'
  });

  try {
    smartweave = SmartWeaveNodeFactory.memCached(arweave);

    wallet = await arweave.wallets.generate();
    const walletAddress = await arweave.wallets.getAddress(wallet);
    await arweave.api.get(`/mint/${walletAddress}/1000000000000000`);

    contractSrc = fs.readFileSync(
      path.join(__dirname, '../src/__tests__/integration/', 'data/writing-contract.js'),
      'utf8'
    );
    const contractTxId = await smartweave.createContract.deploy({
      wallet,
      initState: JSON.stringify({ticker: 'WRITING_CONTRACT'}),
      src: contractSrc
    });

    const contract = smartweave.contract(contractTxId).connect(wallet).setEvaluationOptions({
      ignoreExceptions: false,
      internalWrites: true
    });
    await mine();

    await contract.writeInteraction({function: 'writeContract', contractId: contractTxId, amount: 10});
    await contract.writeInteraction({function: 'writeContract', contractId: contractTxId, amount: 10});
    await contract.writeInteraction({function: 'writeContract', contractId: contractTxId, amount: 10});
    await contract.writeInteraction({function: 'writeContract', contractId: contractTxId, amount: 10});
    await contract.writeInteraction({function: 'writeContract', contractId: contractTxId, amount: 10});
    await contract.writeInteraction({function: 'writeContract', contractId: contractTxId, amount: 10});
    await contract.writeInteraction({function: 'writeContract', contractId: contractTxId, amount: 10});
    await mine();


    const interactionsLoader = new ArweaveGatewayInteractionsLoader(arweave);

    const lexSorting = new LexicographicalInteractionsSorter(arweave);
    const interactions = await interactionsLoader.load(contractTxId, 0, 100, new DefaultEvaluationOptions());
    const sorted = await lexSorting.sort([...interactions]);
    logger.info("\n\nLexicographical");
    sorted.forEach(v => {
      logger.info(`${v.node.id}: sortKey [${v.sortKey}]`);
    });

    const blockHeightSorting = new BlockHeightInteractionsSorter();
    const interactions2 = await interactionsLoader.load(contractTxId, 0, 100, new DefaultEvaluationOptions());
    const sorted2 = await blockHeightSorting.sort([...interactions2]);
    logger.info("\n\nBlock height");
    sorted2.forEach(v => {
      logger.info(`${v.node.id}: sortKey [${v.sortKey}]`);
    });

  } finally {
    await arlocal.stop();
  }

  async function mine() {
    await arweave.api.get('mine');
  }
}

main().catch((e) => console.error(e));
