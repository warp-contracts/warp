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
Script allows to benchmark loading interactions response time based on the given gateway
To run this script properly, one need to pass [gateway name][contract id][from][to] variables as script's arguments
e.g yarn ts-node -r tsconfig-paths/register tools/gateways-comparison-benchmark.ts arweave Daj-MNSnH55TDfxqC7v4eq0lKzVIwh98srUaWqyuZtY 0 70000
*/

async function gatewayBenchmark() {
  let table = new Table({
    head: ['gateway', 'contractId', 'fromBlockHeight', 'toBlockHeight', 'timeSpent'],
    colWidths: [10, 50, 20, 20, 20]
  });

  const arweave = Arweave.init({
    host: 'arweave.net',
    port: 443,
    protocol: 'https',
    logging: false
  });

  LoggerFactory.use(new TsLogFactory());
  LoggerFactory.INST.logLevel('debug');

  const gateway = process.argv[2];
  const contractId = process.argv[3];
  const fromBlockHeight = process.argv[4];
  const toBlockHeight = process.argv[5];

  const loader =
    gateway == 'arweave'
      ? new ArweaveGatewayInteractionsLoader(arweave)
      : new RedstoneGatewayInteractionsLoader('https://d1o5nlqr4okus2.cloudfront.net');

  const options = gateway == 'arweave' ? new DefaultEvaluationOptions() : null;

  const benchmark = Benchmark.measure();
  await loader.load(contractId, parseInt(fromBlockHeight), parseInt(toBlockHeight), options);

  const timeSpent = benchmark.elapsed();

  table.push([gateway, contractId, fromBlockHeight, toBlockHeight, timeSpent.toString()].map((el) => colors.blue(el)));

  console.log(table.toString());
}

gatewayBenchmark().catch((e) => console.error(e));
