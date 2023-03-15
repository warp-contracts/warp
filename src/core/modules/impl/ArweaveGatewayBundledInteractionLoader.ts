import Arweave from 'arweave';
import { SmartWeaveTags } from '../../SmartWeaveTags';
import { GQLEdgeInterface, GQLNodeInterface } from '../../../legacy/gqlResult';
import { Benchmark } from '../../../logging/Benchmark';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { ArweaveWrapper } from '../../../utils/ArweaveWrapper';
import { GW_TYPE, InteractionsLoader } from '../InteractionsLoader';
import { InteractionsSorter } from '../InteractionsSorter';
import { EvaluationOptions } from '../StateEvaluator';
import { LexicographicalInteractionsSorter } from './LexicographicalInteractionsSorter';
import { WarpEnvironment } from '../../Warp';
import { generateMockVrf } from '../../../utils/vrf';
import { Tag } from 'utils/types/arweave-types';
import { ArweaveGQLTxsFetcher } from './ArweaveGQLTxsFetcher';
import { WarpSequencerTags, WARP_SEQUENCER_TAGS } from '../../WarpSequencerTags';
import { safeParseInt } from '../../../utils/utils';

const MAX_REQUEST = 100;
// SortKey.blockHeight is blockheight
// at which interaction was send to bundler
// it can be actually finalized in later block
// we assume that this maximal "delay"
const EMPIRIC_BUNDLR_FINALITY_TIME = 100;

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

export class ArweaveGatewayBundledInteractionLoader implements InteractionsLoader {
  private readonly logger = LoggerFactory.INST.create(ArweaveGatewayBundledInteractionLoader.name);

  private readonly arweaveFetcher: ArweaveGQLTxsFetcher;
  private readonly arweaveWrapper: ArweaveWrapper;
  private readonly sorter: InteractionsSorter;

  constructor(protected readonly arweave: Arweave, private readonly environment: WarpEnvironment) {
    this.arweaveWrapper = new ArweaveWrapper(arweave);
    this.arweaveFetcher = new ArweaveGQLTxsFetcher(arweave);
    this.sorter = new LexicographicalInteractionsSorter(arweave);
  }

  async load(
    contractId: string,
    fromSortKey?: string,
    toSortKey?: string,
    evaluationOptions?: EvaluationOptions
  ): Promise<GQLNodeInterface[]> {
    this.logger.debug('Loading interactions for', { contractId, fromSortKey, toSortKey });

    const fromBlockHeight = this.sorter.extractBlockHeight(fromSortKey) || 0;
    const toBlockHeight = this.sorter.extractBlockHeight(toSortKey) || (await this.currentBlockHeight());

    const mainTransactionsQuery: GqlReqVariables = {
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
        max: toBlockHeight + EMPIRIC_BUNDLR_FINALITY_TIME
      },
      first: MAX_REQUEST
    };

    const loadingBenchmark = Benchmark.measure();
    let interactions = await this.arweaveFetcher.transactions(mainTransactionsQuery);

    if (evaluationOptions.internalWrites) {
      interactions = await this.appendInternalWriteInteractions(
        contractId,
        fromBlockHeight,
        toBlockHeight,
        interactions
      );
    }
    loadingBenchmark.stop();

    this.logger.debug('All loaded interactions:', {
      from: fromSortKey,
      to: toSortKey,
      loaded: interactions.length,
      time: loadingBenchmark.elapsed()
    });

    const sortedInteractions = await this.sorter.sort(interactions);
    const isLocalOrTestnetEnv = this.environment === 'local' || this.environment === 'testnet';

    return sortedInteractions
      .filter((interaction) => this.isNewerThenSortKeyBlockHeight(interaction))
      .filter((interaction) => this.isSortKeyInBounds(fromSortKey, toSortKey, interaction))
      .map((interaction) => this.attachSequencerDataToInteraction(interaction))
      .map((interaction) => this.maybeAddMockVrf(isLocalOrTestnetEnv, interaction))
      .map((interaction, index, allInteractions) => this.verifySortKeyIntegrity(interaction, index, allInteractions))
      .map(({ node: interaction }) => interaction);
  }

  private verifySortKeyIntegrity(
    interaction: GQLEdgeInterface,
    index: number,
    allInteractions: GQLEdgeInterface[]
  ): GQLEdgeInterface {
    if (index !== 0) {
      const prevInteraction = allInteractions[index - 1];
      const nextInteraction = allInteractions[index];

      if (prevInteraction.node.sortKey !== nextInteraction.node.lastSortKey) {
        throw Error(
          `Interaction loading error: interaction ${nextInteraction.node.id} lastSortKey is not pointing on prev interaction ${prevInteraction.node.id}`
        );
      }
    }

    return interaction;
  }

  private isSortKeyInBounds(fromSortKey: string, toSortKey: string, interaction: GQLEdgeInterface): boolean {
    if (fromSortKey && toSortKey) {
      return (
        interaction.node.sortKey.localeCompare(fromSortKey) > 0 &&
        interaction.node.sortKey.localeCompare(toSortKey) <= 0
      );
    } else if (fromSortKey && !toSortKey) {
      return interaction.node.sortKey.localeCompare(fromSortKey) > 0;
    } else if (!fromSortKey && toSortKey) {
      return interaction.node.sortKey.localeCompare(toSortKey) <= 0;
    }
    return true;
  }

  private attachSequencerDataToInteraction(interaction: GQLEdgeInterface): GQLEdgeInterface {
    const extractTag = (tagName: WarpSequencerTags) =>
      interaction.node.tags.find((tag: Tag) => tag.name === tagName)?.value;
    const sequencerOwner = extractTag(WARP_SEQUENCER_TAGS.SequencerOwner);
    const sequencerBlockId = extractTag(WARP_SEQUENCER_TAGS.SequencerBlockId);
    const sequencerBlockHeight = extractTag(WARP_SEQUENCER_TAGS.SequencerBlockHeight);
    const sequencerLastSortKey = extractTag(WARP_SEQUENCER_TAGS.SequencerLastSortKey);
    const sequencerSortKey = extractTag(WARP_SEQUENCER_TAGS.SequencerSortKey);
    const sequencerTxId = extractTag(WARP_SEQUENCER_TAGS.SequencerTxId);
    // this field was added in sequencer from 15.03.2023
    const sequencerBlockTimestamp = extractTag(WARP_SEQUENCER_TAGS.SequencerBlockTimestamp);

    if (
      !sequencerOwner ||
      !sequencerBlockId ||
      !sequencerBlockHeight ||
      !sequencerLastSortKey ||
      !sequencerTxId ||
      !sequencerSortKey
    ) {
      throw Error(
        `Interaction ${interaction.node.id} is not sequenced by sequencer aborting. Only Sequenced transactions are supported by loader ${ArweaveGatewayBundledInteractionLoader.name}`
      );
    }

    return {
      ...interaction,
      node: {
        ...interaction.node,
        owner: { address: sequencerOwner, key: null },
        block: {
          ...interaction.node.block,
          height: safeParseInt(sequencerBlockHeight),
          id: sequencerBlockId,
          timestamp: sequencerBlockTimestamp ? safeParseInt(sequencerBlockTimestamp) : interaction.node.block.timestamp
        },
        sortKey: sequencerSortKey,
        lastSortKey: sequencerLastSortKey,
        id: sequencerTxId
      }
    };
  }

  private async appendInternalWriteInteractions(
    contractId: string,
    fromBlockHeight: number,
    toBlockHeight: number,
    interactions: GQLEdgeInterface[]
  ) {
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
    const innerWritesInteractions = await this.arweaveFetcher.transactions(innerWritesVariables);
    this.logger.debug('Inner writes interactions length:', innerWritesInteractions.length);
    interactions = interactions.concat(innerWritesInteractions);
    return interactions;
  }

  private maybeAddMockVrf(isLocalOrTestnetEnv: boolean, interaction: GQLEdgeInterface): GQLEdgeInterface {
    if (isLocalOrTestnetEnv) {
      if (
        interaction.node.tags.some((t) => {
          return t.name == SmartWeaveTags.REQUEST_VRF && t.value === 'true';
        })
      ) {
        interaction.node.vrf = generateMockVrf(interaction.node.sortKey, this.arweave);
      }
    }
    return interaction;
  }

  private isNewerThenSortKeyBlockHeight(interaction: GQLEdgeInterface): boolean {
    if (interaction.node.sortKey) {
      const blockHeightSortKey = interaction.node.sortKey.split(',')[0];

      const sendToBundlerBlockHeight = Number.parseInt(blockHeightSortKey);
      const finalizedBlockHeight = Number(interaction.node.block.height);
      const blockHeightDiff = finalizedBlockHeight - sendToBundlerBlockHeight;
      if (blockHeightDiff < 0) {
        return false;
      }

      return true;
    }
    return true;
  }

  private async currentBlockHeight(): Promise<number> {
    const info = await this.arweaveWrapper.info();
    return info.height;
  }

  type(): GW_TYPE {
    return 'arweave';
  }

  clearCache(): void {
    // noop
  }
}
