/* eslint-disable */
import Arweave from 'arweave';
import { LoggerFactory } from '../src';
import { TsLogFactory } from '../src/logging/node/TsLogFactory';
import fs from 'fs';
import path from 'path';
import { ContractInteractionsLoader } from '../src/core/modules/impl/ContractInteractionsLoader';
import { DefaultEvaluationOptions } from '../src/core/modules/StateEvaluator';
import {GQLEdgeInterface, GQLTagInterface} from "smartweave/lib/interfaces/gqlResult";

async function main() {
  LoggerFactory.use(new TsLogFactory());

  LoggerFactory.INST.logLevel('debug');

  const arweave = Arweave.init({
    host: 'arweave.net', // Hostname or IP address for a Arweave host
    port: 443, // Port
    protocol: 'https', // Network protocol http or https
    timeout: 60000, // Network request timeouts in milliseconds
    logging: false // Enable network request logging
  });

  const transactionsLoader = new ContractInteractionsLoader(arweave);

  const result = await transactionsLoader.load(
    'Ym2i1XWBAuabbw0qcmSSsmjGtBJbJlDLDxxf277XtK8',
    0,
    832649,
    new DefaultEvaluationOptions()
  );

  const ids = new Set<string>();

  let withDoubleContract = 0;

  result.forEach(r => {
    const contractTags = findTag(r, "Contract");
    if (contractTags.length > 1) {
      withDoubleContract++;
    }
    ids.add(r.node.id);
  });

  console.log("all", result.length);
  console.log("unique", ids.size);
  console.log("with double contract tag", withDoubleContract);

  fs.writeFileSync(path.join(__dirname, 'data', 'transactions-live.json'), JSON.stringify(result));
}

main().catch((e) => console.error(e));

function findTag(
  interaction: GQLEdgeInterface,
  tagName: string
): GQLTagInterface[] {
  return interaction.node.tags.filter((t) => {
    return t.name === tagName;
  });
}
