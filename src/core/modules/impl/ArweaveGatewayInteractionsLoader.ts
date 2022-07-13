import {
  ArweaveWrapper,
  Benchmark,
  EvaluationOptions,
  GQLEdgeInterface,
  GQLNodeInterface,
  GQLResultInterface,
  GQLTransactionsResultInterface,
  InteractionsLoader,
  InteractionsSorter,
  LexicographicalInteractionsSorter,
  LoggerFactory,
  sleep,
  SmartWeaveTags
} from '@warp';
import Arweave from 'arweave';

const MAX_REQUEST = 100;

interface TagFilter {
  name: string;
  values: string[];
}

interface BlockFilter {
  min?: number;
  max?: number;
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
  private readonly sorter: InteractionsSorter;

  constructor(protected readonly arweave: Arweave) {
    this.arweaveWrapper = new ArweaveWrapper(arweave);
    this.sorter = new LexicographicalInteractionsSorter(arweave);
  }

  async load(
    contractId: string,
    fromSortKey?: string,
    toSortKey?: string,
    evaluationOptions?: EvaluationOptions
  ): Promise<GQLNodeInterface[]> {
    this.logger.debug('Loading interactions for', { contractId, fromSortKey, toSortKey });

    const fromBlockHeight = this.sorter.extractBlockHeight(fromSortKey);
    const toBlockHeight = this.sorter.extractBlockHeight(toSortKey);

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

    /**
     * Because the behaviour of the Arweave gateway in case of passing null to min/max block height
     * in the gql query params is unknown (https://discord.com/channels/908759493943394334/908766823342801007/983643012947144725)
     * - we're removing all the interactions, that have null block data.
     */
    interactions = interactions.filter((i) => i.node.block && i.node.block.id && i.node.block.height);

    // note: this operation adds the "sortKey" to the interactions
    let sortedInteractions = await this.sorter.sort(interactions);

    if (fromSortKey || toSortKey) {
      let fromIndex = null;
      const maxIndex = sortedInteractions.length - 1;
      let toIndex = null;
      let breakFrom = false;
      let breakTo = false;

      for (let i = 0; i < sortedInteractions.length; i++) {
        const sortedInteraction = sortedInteractions[i];
        if (sortedInteraction.node.sortKey == fromSortKey) {
          fromIndex = i + 1; // +1, because fromSortKey is exclusive
        }
        if (sortedInteraction.node.sortKey == toSortKey) {
          toIndex = i + 1; // + 1, because "end" parameter in slice does not include the last element
        }
        if ((fromSortKey && fromIndex != null) || !fromSortKey) {
          breakFrom = true;
        }
        if ((toSortKey && toIndex != null) || !toSortKey) {
          breakTo = true;
        }
        if (breakFrom && breakTo) {
          break;
        }
      }

      this.logger.debug('Slicing:', {
        fromIndex,
        toIndex
      });

      // maxIndex + 1, because "end" parameter in slice does not include the last element
      sortedInteractions = sortedInteractions.slice(fromIndex || 0, toIndex || maxIndex + 1);
    }

    this.logger.info('All loaded interactions:', {
      from: fromSortKey,
      to: toSortKey,
      loaded: sortedInteractions.length,
      time: loadingBenchmark.elapsed()
    });

    return sortedInteractions.map((i) => i.node);
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
