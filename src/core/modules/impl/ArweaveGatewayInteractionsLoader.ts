import {
  ArweaveWrapper,
  Benchmark,
  EvaluationOptions,
  GQLEdgeInterface,
  GQLResultInterface,
  GQLTransactionsResultInterface,
  InteractionsLoader,
  LoggerFactory,
  sleep,
  SmartWeaveTags
} from '@smartweave';
import Arweave from 'arweave';
import { Readable } from 'stream';

const MAX_REQUEST = 100;

interface TagFilter {
  name: string;
  values: string[];
}

interface BlockFilter {
  min?: number;
  max: number;
}

export interface GqlReqVariables {
  tags: TagFilter[];
  blockFilter: BlockFilter;
  first: number;
  after?: string;
}

export function bundledTxsFilter(tx: GQLEdgeInterface) {
  return !tx.node.parent?.id && !tx.node.bundledIn?.id;
}

export class ArweaveGatewayInteractionsLoader implements InteractionsLoader {
  private readonly logger = LoggerFactory.INST.create('ArweaveGatewayInteractionsLoader');

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
          bundledIn { id }
        }
        cursor
      }
    }
  }`;

  private static readonly _30seconds = 30 * 1000;

  private readonly arweaveWrapper: ArweaveWrapper;

  constructor(private readonly arweave: Arweave) {
    this.arweaveWrapper = new ArweaveWrapper(arweave);
  }

  async load(
    contractId: string,
    fromBlockHeight: number,
    toBlockHeight: number,
    evaluationOptions: EvaluationOptions
  ): Promise<GQLEdgeInterface[] | Readable> {
    this.logger.debug('Loading interactions for', { contractId, fromBlockHeight, toBlockHeight });
    const mainTransactionsVariables: GqlReqVariables = {
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

    const loadingBenchmark = Benchmark.measure();
    let interactions = await this.loadPages(mainTransactionsVariables);
    loadingBenchmark.stop();

    if (evaluationOptions.internalWrites) {
      const innerWritesVariables: GqlReqVariables = {
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

    this.logger.info('All loaded interactions:', {
      from: fromBlockHeight,
      to: toBlockHeight,
      loaded: interactions.length,
      time: loadingBenchmark.elapsed()
    });

    return interactions;
  }

  private async loadPages(variables: GqlReqVariables) {
    let transactions = await this.getNextPage(variables);

    // note: according to https://discord.com/channels/357957786904166400/756557551234973696/920918240702660638
    // protection against "bundledIn" should not be necessary..but..better safe than sorry :-)
    // note: it will be now necessary - with RedStone Sequencer
    const txInfos: GQLEdgeInterface[] = transactions.edges.filter((tx) => bundledTxsFilter(tx));

    while (transactions.pageInfo.hasNextPage) {
      const cursor = transactions.edges[MAX_REQUEST - 1].cursor;

      variables = {
        ...variables,
        after: cursor
      };

      transactions = await this.getNextPage(variables);

      txInfos.push(...transactions.edges.filter((tx) => bundledTxsFilter(tx)));
    }
    return txInfos;
  }

  private async getNextPage(variables: GqlReqVariables): Promise<GQLTransactionsResultInterface> {
    const benchmark = Benchmark.measure();
    let response = await this.arweaveWrapper.gql(ArweaveGatewayInteractionsLoader.query, variables);
    this.logger.debug('GQL page load:', benchmark.elapsed());

    while (response.status === 403) {
      this.logger.warn(`GQL rate limiting, waiting ${ArweaveGatewayInteractionsLoader._30seconds}ms before next try.`);

      await sleep(ArweaveGatewayInteractionsLoader._30seconds);

      response = await this.arweaveWrapper.gql(ArweaveGatewayInteractionsLoader.query, variables);
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
