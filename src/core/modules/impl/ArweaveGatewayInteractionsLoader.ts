import Arweave from 'arweave';
import { SMART_WEAVE_TAGS, WARP_TAGS } from '../../KnownTags';
import { GQLEdgeInterface, GQLNodeInterface } from '../../../legacy/gqlResult';
import { Benchmark } from '../../../logging/Benchmark';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { GW_TYPE, InteractionsLoader } from '../InteractionsLoader';
import { InteractionsSorter } from '../InteractionsSorter';
import { EvaluationOptions } from '../StateEvaluator';
import { LexicographicalInteractionsSorter } from './LexicographicalInteractionsSorter';
import { WarpEnvironment } from '../../Warp';
import { generateMockVrf } from '../../../utils/vrf';
import { ArweaveGQLTxsFetcher, ArweaveTransactionQuery } from './ArweaveGQLTxsFetcher';

const MAX_REQUEST = 100;

export function bundledTxsFilter(tx: GQLEdgeInterface) {
  return !tx.node.parent?.id && !tx.node.bundledIn?.id;
}

export class ArweaveGatewayInteractionsLoader implements InteractionsLoader {
  private readonly logger = LoggerFactory.INST.create('ArweaveGatewayInteractionsLoader');

  private readonly sorter: InteractionsSorter;
  private readonly arweaveTransactionQuery: ArweaveGQLTxsFetcher;

  constructor(protected readonly arweave: Arweave, private readonly environment: WarpEnvironment) {
    this.sorter = new LexicographicalInteractionsSorter(arweave);
    this.arweaveTransactionQuery = new ArweaveGQLTxsFetcher(arweave);
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

    const mainTransactionsQuery: ArweaveTransactionQuery = {
      tags: [
        {
          name: SMART_WEAVE_TAGS.APP_NAME,
          values: ['SmartWeaveAction']
        },
        {
          name: SMART_WEAVE_TAGS.CONTRACT_TX_ID,
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
    let interactions = (await this.arweaveTransactionQuery.transactions(mainTransactionsQuery)).filter(
      bundledTxsFilter
    );
    loadingBenchmark.stop();

    if (evaluationOptions.internalWrites) {
      const innerWritesVariables: ArweaveTransactionQuery = {
        tags: [
          {
            name: WARP_TAGS.INTERACT_WRITE,
            values: [contractId]
          }
        ],
        blockFilter: {
          min: fromBlockHeight,
          max: toBlockHeight
        },
        first: MAX_REQUEST
      };
      const innerWritesInteractions = await (
        await this.arweaveTransactionQuery.transactions(innerWritesVariables)
      ).filter(bundledTxsFilter);

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
            return t.name == WARP_TAGS.REQUEST_VRF && t.value === 'true';
          })
        ) {
          interaction.vrf = generateMockVrf(interaction.sortKey, this.arweave);
        }
      }

      return interaction;
    });
  }

  type(): GW_TYPE {
    return 'arweave';
  }

  clearCache(): void {
    // noop
  }
}
