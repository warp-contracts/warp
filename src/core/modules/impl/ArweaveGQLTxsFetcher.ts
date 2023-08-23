import { GQLEdgeInterface, GQLResultInterface, GQLTransaction, GQLTransactionResponse } from 'legacy/gqlResult';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { ArweaveWrapper } from '../../../utils/ArweaveWrapper';
import { sleep } from '../../../utils/utils';
import { Benchmark } from '../../../logging/Benchmark';
import { Warp } from '../../Warp';
import { WARP_TAGS } from '../../KnownTags';

const TRANSACTIONS_QUERY = `query Transactions($tags: [TagFilter!]!, $blockFilter: BlockFilter!, $first: Int!, $after: String) {
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

const TRANSACTION_QUERY = `query Transaction($id: ID!) {
  transaction(id: $id) {
          id
          owner { address, key }
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
          fee { winston, ar }
          quantity { winston, ar }
          bundledIn { id }
    			parent{ id }
          signature
        }
}`;

// this is a query for old/legacy bundler format
const TRANSACTION_QUERY_USING_TAG = `query Transactions($tags: [TagFilter!]!) {
  transactions(tags: $tags) {
      edges {
        node {
          id
          owner { address, key }
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
          fee { winston, ar }
          quantity { winston, ar }
          parent { id }
          bundledIn { id }
          signature
        }
      }
  }
}`;

interface TagFilter {
  name: string;
  values: string[];
}

interface BlockFilter {
  min?: number;
  max?: number;
}

export interface ArweaveTransactionQuery {
  tags?: TagFilter[];
  blockFilter?: BlockFilter;
  first?: number;
  after?: string;
}

const RETRY_TIMEOUT = 30 * 1000;
const MAX_REQUEST = 100;

/**
 * Query all transactions from arweave gateway
 */
export class ArweaveGQLTxsFetcher {
  private readonly arweaveWrapper: ArweaveWrapper;
  private readonly logger = LoggerFactory.INST.create(ArweaveGQLTxsFetcher.name);

  constructor(protected readonly warp: Warp) {
    this.arweaveWrapper = new ArweaveWrapper(warp);
  }

  async transaction(transactionId: string): Promise<GQLTransaction> {
    const response = await this.fetch<GQLTransactionResponse>(TRANSACTION_QUERY, { id: transactionId });

    return response.transaction;
  }

  /**
   * Fetches transaction stored using legacy bundling format.
   */
  async transactionUsingUploaderTag(transactionId: string): Promise<GQLTransaction> {
    const txTag: TagFilter = {
      name: WARP_TAGS.UPLOADER_TX_ID,
      values: [transactionId]
    };
    const response = (await this.fetch<GQLResultInterface['data']>(TRANSACTION_QUERY_USING_TAG, { tags: [txTag] }))
      .transactions;

    if (response.edges.length < 1) {
      throw new Error(`No interaction with tag ${WARP_TAGS.UPLOADER_TX_ID}:${transactionId}`);
    }
    return response.edges[0].node;
  }

  async transactions(variables: ArweaveTransactionQuery): Promise<GQLEdgeInterface[]> {
    let pageResult = (await this.fetch<GQLResultInterface['data']>(TRANSACTIONS_QUERY, variables)).transactions;
    const edges: GQLEdgeInterface[] = [...pageResult.edges];
    while (pageResult.pageInfo.hasNextPage) {
      const cursor = pageResult.edges[MAX_REQUEST - 1].cursor;

      const newVariables = {
        ...variables,
        after: cursor
      };

      pageResult = (await this.fetch<GQLResultInterface['data']>(TRANSACTIONS_QUERY, newVariables)).transactions;
      edges.push(...pageResult.edges);
    }
    return edges;
  }

  private async fetch<R = unknown>(gqlQuery: string, variables: unknown): Promise<R> {
    const benchmark = Benchmark.measure();
    let response = await this.arweaveWrapper.gql(gqlQuery, variables);
    this.logger.debug('GQL page load:', benchmark.elapsed());

    while (response.status === 403) {
      this.logger.warn(`GQL rate limiting, waiting ${RETRY_TIMEOUT}ms before next try.`);

      await sleep(RETRY_TIMEOUT);

      response = await this.arweaveWrapper.gql(gqlQuery, variables);
    }

    if (response.status !== 200) {
      throw new Error(`Unable to retrieve transactions. Arweave gateway responded with status ${response.status}.`);
    }

    if (response.data.errors) {
      this.logger.error(response.data.errors);
      throw new Error('Error while fetching arweave transactions');
    }

    return response.data.data;
  }
}
