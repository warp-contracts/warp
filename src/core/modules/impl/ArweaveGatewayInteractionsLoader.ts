import Arweave from 'arweave';
import { SMART_WEAVE_TAGS, WARP_TAGS } from '../../KnownTags';
import { GQLEdgeInterface, GQLNodeInterface } from '../../../legacy/gqlResult';
import { Benchmark } from '../../../logging/Benchmark';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { GW_TYPE, InteractionsLoader } from '../InteractionsLoader';
import { InteractionsSorter } from '../InteractionsSorter';
import { EvaluationOptions } from '../StateEvaluator';
import { LexicographicalInteractionsSorter } from './LexicographicalInteractionsSorter';
import { Warp, WarpEnvironment } from '../../Warp';
import { ArweaveGQLTxsFetcher, ArweaveTransactionQuery } from './ArweaveGQLTxsFetcher';
import { VrfPluginFunctions } from '../../WarpPlugin';
import { TagsParser } from './TagsParser';

const MAX_REQUEST = 100;

export function bundledTxsFilter(tx: GQLEdgeInterface) {
  return !tx.node.parent?.id && !tx.node.bundledIn?.id;
}

export class ArweaveGatewayInteractionsLoader implements InteractionsLoader {
  private readonly logger = LoggerFactory.INST.create('ArweaveGatewayInteractionsLoader');

  private readonly sorter: InteractionsSorter;
  private arweaveTransactionQuery: ArweaveGQLTxsFetcher;
  private _warp: Warp;
  private readonly tagsParser = new TagsParser();

  constructor(protected readonly arweave: Arweave, private readonly environment: WarpEnvironment) {
    this.sorter = new LexicographicalInteractionsSorter(arweave);
  }

  async load(
    contractId: string,
    fromSortKey?: string,
    toSortKey?: string,
    evaluationOptions?: EvaluationOptions,
    signal?: AbortSignal
  ): Promise<GQLNodeInterface[]> {
    this.logger.debug('Loading interactions for', { contractId, fromSortKey, toSortKey });

    const fromBlockHeight = this.sorter.extractBlockHeight(fromSortKey);
    let toBlockHeight = this.sorter.extractBlockHeight(toSortKey);
    const pagesPerBatch = evaluationOptions?.transactionsPagesPerBatch || Number.MAX_SAFE_INTEGER;
    this.logger.debug('Pages per batch', pagesPerBatch);

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
    let interactions = (
      await this.arweaveTransactionQuery.transactions(mainTransactionsQuery, pagesPerBatch, signal)
    ).filter(bundledTxsFilter);
    loadingBenchmark.stop();
    if (evaluationOptions?.transactionsPagesPerBatch && interactions.length > 0) {
      interactions = await this.sorter.sort(interactions);
      toBlockHeight = interactions[interactions.length - 1].node.block.height;
    }

    if (evaluationOptions.internalWrites) {
      const pagesPerBatchIw = (function () {
        if (evaluationOptions?.transactionsPagesPerBatch) {
          if (interactions.length > 0) {
            // note: the limit in this case is the block height of the last 'direct' interaction
            return Number.MAX_SAFE_INTEGER;
          } else {
            return evaluationOptions?.transactionsPagesPerBatch;
          }
        } else {
          return Number.MAX_SAFE_INTEGER;
        }
      })();

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
      const innerWritesInteractions = (
        await this.arweaveTransactionQuery.transactions(innerWritesVariables, pagesPerBatchIw, signal)
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
    // deduplicate any interactions that may have been provided twice
    const interactionMap = new Map();
    for (const interaction of interactions) {
      if (!interactionMap.has(interaction.node.id)) {
        interactionMap.set(interaction.node.id, interaction);
      }
    }
    const deduplicatedInteractions = Array.from(interactionMap.values());

    // note: this operation adds the "sortKey" to the interactions
    let sortedInteractions = await this.sorter.sort(deduplicatedInteractions);

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
    const vrfPlugin = this._warp.maybeLoadPlugin<void, VrfPluginFunctions>('vrf');

    return sortedInteractions.map((i) => {
      const interaction = i.node;
      if (isLocalOrTestnetEnv) {
        if (this.tagsParser.hasVrfTag(interaction)) {
          if (vrfPlugin) {
            interaction.vrf = vrfPlugin.process().generateMockVrf(interaction.sortKey);
          } else {
            this.logger.warn('Cannot generate mock vrf for interaction - no "warp-contracts-plugin-vrf" attached!');
          }
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

  set warp(warp: Warp) {
    this.arweaveTransactionQuery = new ArweaveGQLTxsFetcher(warp);
    this._warp = warp;
  }
}
