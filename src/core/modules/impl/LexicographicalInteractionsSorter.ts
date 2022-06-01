import { arrayToHex, GQLEdgeInterface, InteractionsSorter, LoggerFactory, SourceType } from '@smartweave';
import Arweave from 'arweave';

// note: this (i.e. padding to 13 digits) should be safe between years ~1966 and ~2286
const defaultArweaveMs = ''.padEnd(13, '9');

const sortingLast = ''.padEnd(64, 'z');

/**
 * implementation that is based on current's SDK sorting alg.
 */
export class LexicographicalInteractionsSorter implements InteractionsSorter {
  private readonly logger = LoggerFactory.INST.create('LexicographicalInteractionsSorter');

  constructor(private readonly arweave: Arweave) {}

  async sort(transactions: GQLEdgeInterface[]): Promise<GQLEdgeInterface[]> {
    const copy = [...transactions];
    const addKeysFuncs = copy.map((tx) => this.addSortKey(tx));
    await Promise.all(addKeysFuncs);

    return copy.sort((a, b) => a.node.sortKey.localeCompare(b.node.sortKey));
  }

  public async createSortKey(blockId: string, transactionId: string, blockHeight: number) {
    const blockHashBytes = this.arweave.utils.b64UrlToBuffer(blockId);
    const txIdBytes = this.arweave.utils.b64UrlToBuffer(transactionId);
    const concatenated = this.arweave.utils.concatBuffers([blockHashBytes, txIdBytes]);
    const hashed = arrayToHex(await this.arweave.crypto.hash(concatenated));
    const blockHeightString = `${blockHeight}`.padStart(12, '0');

    return `${blockHeightString},${defaultArweaveMs},${hashed}`;
  }

  public extractBlockHeight(sortKey?: string): number | null {
    // I feel sorry for myself...
    return sortKey ? parseInt(sortKey.split(',')[0]) : null;
  }

  private async addSortKey(txInfo: GQLEdgeInterface) {
    const { node } = txInfo;

    // might have been already set by the RedStone Sequencer
    if (txInfo.node.sortKey !== undefined && txInfo.node.source == SourceType.REDSTONE_SEQUENCER) {
      this.logger.debug('Using sortKey from sequencer', txInfo.node.sortKey);
    } else {
      txInfo.node.sortKey = await this.createSortKey(node.block.id, node.id, node.block.height);
      /*console.log('Generating sortKey', {
        blockId: node.block.id,
        transactionId: node.id,
        height: node.block.height,
        sortKey: txInfo.node.sortKey
      });*/
    }
  }

  generateLastSortKey(blockHeight: number): string {
    const blockHeightString = `${blockHeight}`.padStart(12, '0');
    return `${blockHeightString},${defaultArweaveMs},${sortingLast}`;
  }
}
