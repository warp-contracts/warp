import Arweave from 'arweave';
import { SmartWeaveTags } from '../../../core/SmartWeaveTags';
import {
  GQLEdgeInterface,
  GQLNodeInterface,
  GQLTransactionsResultInterface,
  GQLResultInterface
} from '../../../legacy/gqlResult';
import { Benchmark } from '../../../logging/Benchmark';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { ArweaveWrapper } from '../../../utils/ArweaveWrapper';
import { sleep } from '../../../utils/utils';
import { GW_TYPE, InteractionsLoader } from '../InteractionsLoader';
import { InteractionsSorter } from '../InteractionsSorter';
import { EvaluationOptions } from '../StateEvaluator';
import { LexicographicalInteractionsSorter } from './LexicographicalInteractionsSorter';
import { WarpEnvironment } from '../../Warp';
import { generateMockVrf } from '../../../utils/vrf';

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

  constructor(protected readonly arweave: Arweave, private readonly environment: WarpEnvironment) {
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

    if (fromSortKey && toSortKey) {
      sortedInteractions = sortedInteractions.filter((i) => {
        return i.node.sortKey.localeCompare(fromSortKey) > 0 && i.node.sortKey.localeCompare(toSortKey) <= 0;
      });
    } else if (fromSortKey && !toSortKey) {
      sortedInteractions = sortedInteractions.filter((i) => {
        return i.node.sortKey.localeCompare(fromSortKey) > 0;
      });
    } else if (!fromSortKey && toSortKey) {
      sortedInteractions = sortedInteractions.filter((i) => {
        return i.node.sortKey.localeCompare(toSortKey) <= 0;
      });
    }

    this.logger.debug('All loaded interactions:', {
      from: fromSortKey,
      to: toSortKey,
      loaded: sortedInteractions.length,
      time: loadingBenchmark.elapsed()
    });

    const isLocalOrTestnetEnv = this.environment === 'local' || this.environment === 'testnet';
    return sortedInteractions.map((i) => {
      const interaction = i.node;
      if (isLocalOrTestnetEnv) {
        if (
          interaction.tags.some((t) => {
            return t.name == SmartWeaveTags.REQUEST_VRF && t.value === 'true';
          })
        ) {
          interaction.vrf = generateMockVrf(interaction.sortKey, this.arweave);
        }
      }

      return interaction;
    });
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

  type(): GW_TYPE {
    return 'arweave';
  }

  clearCache(): void {
    // noop
  }
}
