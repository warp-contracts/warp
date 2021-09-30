import {
  ContractInteractionsLoader,
  GQLEdgeInterface,
  GQLResultInterface,
  GQLTransactionsResultInterface
} from '@smartweave';
import Arweave from 'arweave';
import fs from 'fs';
import path from 'path';

// max number of results returned from single query.
// If set more, arweave.net/graphql will still limit to 100 (not sure if that's a bug or feature).
const MAX_RESULTS_PER_PAGE = 100;

const transactionsQuery = `
query Transactions($tags: [TagFilter!]!, $after: String) {
    transactions(tags: $tags, first: 100,  sort: HEIGHT_ASC, after: $after) {
      pageInfo {
        hasNextPage
      }
      edges {
        node {
          id
          tags {
            name
            value
          }
        }
        cursor
      }
    }
  }`;

const toSkip = ['C_1uo08qRuQAeDi9Y1I8fkaWYUC9IWkOrKDNe9EphJo',
'B1SRLyFzWJjeA0ywW41Qu1j7ZpBLHsXSSrWLrT3ebd8'];


async function main() {
  const arweave = Arweave.init({
    host: 'arweave.net', // Hostname or IP address for a Arweave host
    port: 443, // Port
    protocol: 'https', // Network protocol http or https
    timeout: 60000, // Network request timeouts in milliseconds
    logging: false // Enable network request logging
  });

  const contractTxs = await sendQuery(
    arweave,
    {
      tags: [
        {
          name: 'App-Name',
          values: ['SmartWeaveContract']
        },
        {
          name: 'Content-Type',
          values: ['application/json']
        }
      ],
      after: undefined
    },
    transactionsQuery
  );

  console.log(`Checking ${contractTxs.length} contracts`);

  const result = {};

  const transactionsLoader = new ContractInteractionsLoader(arweave);


  // loading
  for (const contractTx of contractTxs) {
    const contractTxId = contractTx.node.id;
    if (toSkip.indexOf(contractTxId) !== -1) {
      continue;
    }

    console.log(
      `\n[${contractTxs.indexOf(contractTx) + 1} / ${contractTxs.length}] loading interactions of the ${contractTxId}`
    );
    const interactions = await transactionsLoader.load(contractTxId, 0, 779826);
    console.log(`${contractTxId}: ${interactions.length}`);

    result[contractTxId] = interactions.length;
    fs.writeFileSync(path.join(__dirname, 'data', `swc-stats.json`), JSON.stringify(result));
  }

 // fs.writeFileSync(path.join(__dirname, 'data', `swc-stats.json`), JSON.stringify(result));

  // sorting
  console.log('Sorting...');

  const contracts = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', `swc-stats.json`), 'utf-8'));

  const sortable = [];
  // tslint:disable-next-line:forin
  for (const contract in contracts) {
    sortable.push([contract, contracts[contract]]);
  }
  sortable.sort((a, b) => b[1] - a[1]);
  const sortedContracts = {};
  sortable.forEach((item) => (sortedContracts[item[0]] = item[1]));

  console.log(sortedContracts);

  fs.writeFileSync(path.join(__dirname, 'data', `swc-sorted-stats.json`), JSON.stringify(sortedContracts));
}

main().then(() => {
  console.log('done');
});

async function sendQuery(arweave: Arweave, variables: any, query: string) {
  let transactions: GQLTransactionsResultInterface | null = await getNextPage(arweave, variables, query);

  const txs: GQLEdgeInterface[] = transactions.edges.filter((tx) => !tx.node.parent || !tx.node.parent.id);

  while (transactions.pageInfo.hasNextPage) {
    const cursor = transactions.edges[MAX_RESULTS_PER_PAGE - 1].cursor;

    variables = {
      ...variables,
      after: cursor
    };

    transactions = await getNextPage(arweave, variables, query);
    txs.push(...transactions.edges.filter((tx) => !tx.node.parent || !tx.node.parent.id));
  }

  return txs;
}

async function getNextPage(arweave, variables, query: string): Promise<GQLTransactionsResultInterface | null> {
  const response = await arweave.api.post('graphql', {
    query,
    variables
  });

  if (response.status !== 200) {
    console.error(response);
    throw new Error(`Wrong response status from Arweave: ${response.status}`);
  }

  if (response.data.errors) {
    console.error(response.data.errors);
    throw new Error('Error while loading transactions');
  }

  const data: GQLResultInterface = response.data;

  return data.data.transactions;
}
