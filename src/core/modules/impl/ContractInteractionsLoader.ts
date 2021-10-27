import {
  Benchmark, EvaluationOptions,
  GQLEdgeInterface,
  GQLResultInterface,
  GQLTransactionsResultInterface,
  InteractionsLoader,
  LoggerFactory,
  sleep,
  SmartWeaveTags
} from '@smartweave';
import Arweave from 'arweave';

const MAX_REQUEST = 100;

interface TagFilter {
  name: string;
  values: string[];
}

interface BlockFilter {
  min?: number;
  max: number;
}

interface ReqVariables {
  tags: TagFilter[];
  blockFilter: BlockFilter;
  first: number;
  after?: string;
}

export class ContractInteractionsLoader implements InteractionsLoader {
  private readonly logger = LoggerFactory.INST.create('ContractInteractionsLoader');

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

  async load(
    contractId: string,
    fromBlockHeight: number,
    toBlockHeight: number,
    evaluationOptions: EvaluationOptions
  ): Promise<GQLEdgeInterface[]> {
    this.logger.debug('Loading interactions for', contractId);
    const mainTransactionsVariables: ReqVariables = {
      tags: [
        {
          name: SmartWeaveTags.APP_NAME,
          values: ['SmartWeaveAction']
        },
        {
          name: SmartWeaveTags.CONTRACT_TX_ID,
          values: [contractId]
        }
      ],
      blockFilter: {
        min: fromBlockHeight,
        max: toBlockHeight
      },
      first: MAX_REQUEST
    };

    let interactions = await this.loadPages(mainTransactionsVariables);

    if (evaluationOptions.internalWrites) {
      let innerWritesVariables: ReqVariables = {
        tags: [
          {
            name: SmartWeaveTags.INTERACT_WRITE,
            values: [contractId]
          }
        ],
        blockFilter: {
          min: fromBlockHeight,
          max: toBlockHeight
        },
        first: MAX_REQUEST
      };
      const innerWritesInteractions = await this.loadPages(innerWritesVariables);
      this.logger.debug('Inner writes interactions length:', innerWritesInteractions.length);
      interactions = interactions.concat(innerWritesInteractions);
    }

    this.logger.debug('All loaded interactions:', {
      from: fromBlockHeight,
      to: toBlockHeight,
      loaded: interactions.length
    });

    return interactions;
  }

  private async loadPages(variables: ReqVariables) {
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
    return txInfos;
  }

  private async getNextPage(variables: ReqVariables): Promise<GQLTransactionsResultInterface> {
    const benchmark = Benchmark.measure();
    let response = await this.arweave.api.post('graphql', {
      query: ContractInteractionsLoader.query,
      variables
    });
    this.logger.debug('GQL page load:', benchmark.elapsed());

    while (response.status === 403) {
      this.logger.debug(`GQL rate limiting, waiting ${ContractInteractionsLoader._30seconds}ms before next try.`);

      await sleep(ContractInteractionsLoader._30seconds);

      response = await this.arweave.api.post('graphql', {
        query: ContractInteractionsLoader.query,
        variables
      });
    }

    if (response.status !== 200) {
      throw new Error(`Unable to retrieve transactions. Arweave gateway responded with status ${response.status}.`);
    }

    if (response.data.errors) {
      this.logger.error(response.data.errors);
      throw new Error('Error while loading interaction transactions');
    }

    const data: GQLResultInterface = response.data;

    const txs = data.data.transactions;

    return txs;
  }
}
