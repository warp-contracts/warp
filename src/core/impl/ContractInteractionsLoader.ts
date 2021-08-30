import {
  GQLEdgeInterface,
  GQLResultInterface,
  GQLTransactionsResultInterface,
  InteractionsLoader,
  LoggerFactory,
  SmartWeaveTags
} from '@smartweave';
import Arweave from 'arweave';

const MAX_REQUEST = 100;

interface TagFilter {
  name: string;
  values: string[];
}

interface BlockFilter {
  max: number;
}

interface ReqVariables {
  tags: TagFilter[];
  blockFilter: BlockFilter;
  first: number;
  after?: string;
}

const logger = LoggerFactory.INST.create(__filename);

export class ContractInteractionsLoader implements InteractionsLoader {
  private static readonly query = `query Transactions($tags: [TagFilter!]!, $blockFilter: BlockFilter!, $first: Int!, $after: String) {
    transactions(tags: $tags, block: $blockFilter, first: $first, sort: HEIGHT_ASC, after: $after) {
      pageInfo {
        hasNextPage
      }
      edges {
        node {
          id
          owner { address }
          recipient
          tags {
            name
            value
          }
          block {
            height
            id
            timestamp
          }
          fee { winston }
          quantity { winston }
          parent { id }
        }
        cursor
      }
    }
  }`;

  private static readonly _30seconds = 30 * 1000;

  constructor(private readonly arweave: Arweave) {}

  async load(contractTxId: string, blockHeight: number): Promise<GQLEdgeInterface[]> {
    let variables: ReqVariables = {
      tags: [
        {
          name: SmartWeaveTags.APP_NAME,
          values: ['SmartWeaveAction']
        },
        {
          name: SmartWeaveTags.CONTRACT_TX_ID,
          values: [contractTxId]
        }
      ],
      blockFilter: {
        max: blockHeight
      },
      first: MAX_REQUEST
    };

    let transactions = await this.getNextPage(variables);

    const txInfos: GQLEdgeInterface[] = transactions.edges.filter((tx) => !tx.node.parent || !tx.node.parent.id);

    while (transactions.pageInfo.hasNextPage) {
      const cursor = transactions.edges[MAX_REQUEST - 1].cursor;

      variables = {
        ...variables,
        after: cursor
      };

      transactions = await this.getNextPage(variables);

      txInfos.push(...transactions.edges.filter((tx) => !tx.node.parent || !tx.node.parent.id));
    }

    logger.debug('All interactions:', txInfos.length);

    return txInfos;
  }

  private async getNextPage(variables: ReqVariables): Promise<GQLTransactionsResultInterface> {
    let response = await this.arweave.api.post('graphql', {
      query: ContractInteractionsLoader.query,
      variables
    });

    while (response.status === 403) {
      logger.debug(`GQL rate limiting, waiting ${ContractInteractionsLoader._30seconds}ms before next try.`);

      await ContractInteractionsLoader.sleep(ContractInteractionsLoader._30seconds);

      response = await this.arweave.api.post('graphql', {
        query: ContractInteractionsLoader.query,
        variables
      });
    }

    if (response.status !== 200) {
      throw new Error(`Unable to retrieve transactions. Arweave gateway responded with status ${response.status}.`);
    }

    if (response.data.errors) {
      logger.error(response.data.errors);
      throw new Error('Error while loading interaction transactions');
    }

    const data: GQLResultInterface = response.data;

    const txs = data.data.transactions;

    return txs;
  }

  static async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
