/* eslint-disable */

import Arweave from 'arweave';
import {
  ArweaveGatewayInteractionsLoader,
  DefaultEvaluationOptions,
  LoggerFactory,
  RedstoneGatewayInteractionsLoader,
  Benchmark
} from '@smartweave';
import { TsLogFactory } from '../src/logging/node/TsLogFactory';
import Table from 'cli-table';
import colors from 'colors/safe';

/*
Script allows to benchmark loading interactions response time for given contract for both Arweave and Redstone gateways
To run this script properly, one need to pass [contract id][from][to] variables as script's arugments
e.g yarn ts-node -r tsconfig-paths/register tools/gateways-comparison-benchmark.ts Daj-MNSnH55TDfxqC7v4eq0lKzVIwh98srUaWqyuZtY 0 70000
*/

async function gatewayComparisonBenchmark() {
  let table = new Table({
    head: ['contractId', 'fromBlockHeight', 'toBlockHeight', 'arweave', 'redstone'],
    colWidths: [50, 20, 20, 15, 15]
  });

  LoggerFactory.use(new TsLogFactory());
  LoggerFactory.INST.logLevel('debug');

  const contractId = process.argv[2];
  const fromBlockHeight = process.argv[3];
  const toBlockHeight = process.argv[4];

  const timeSpentArweave = await loadFromAweaveGateway(contractId, fromBlockHeight, toBlockHeight);

  const timeSpentRedstone = await loadFromRedstoneGateway(contractId, fromBlockHeight, toBlockHeight);

  table.push(
    [contractId, fromBlockHeight, toBlockHeight, timeSpentArweave.toString(), `${timeSpentRedstone.toString()}ms`].map(
      (el) => colors.blue(el)
    )
  );

  console.log(table.toString());
}

async function loadFromRedstoneGateway(contractId: string, fromBlockHeight?: string, toBlockHeight?: string) {
  const loader = new RedstoneGatewayInteractionsLoader('https://d1o5nlqr4okus2.cloudfront.net');

  const benchmark = Benchmark.measure();
  for (let i = 0; i < 3; i++) {
    await loader.load(contractId, parseInt(fromBlockHeight), parseInt(toBlockHeight));
  }
  return Math.round(parseInt(benchmark.elapsed().toString().replace('ms', ''))) / 3;
}

async function loadFromAweaveGateway(contractId: string, fromBlockHeight?: string, toBlockHeight?: string) {
  const arweave = Arweave.init({
    host: 'arweave.net',
    port: 443,
    protocol: 'https',
    logging: false
  });

  const loader = new ArweaveGatewayInteractionsLoader(arweave);
  const benchmark = Benchmark.measure();
  await loader.load(
    contractId,
    fromBlockHeight ? parseInt(fromBlockHeight) : 0,
    toBlockHeight ? parseInt(toBlockHeight) : 831900,
    new DefaultEvaluationOptions()
  );
  return benchmark.elapsed();
}
gatewayComparisonBenchmark().catch((e) => console.error(e));
