import { arrayToHex, GQLEdgeInterface, InteractionsSorter } from '@smartweave';
import Arweave from 'arweave';

/**
 * implementation that is based on current's SDK sorting alg. (which seems to be wrong ;-))
 */
export class LexicographicalInteractionsSorter implements InteractionsSorter {
  constructor(private readonly arweave: Arweave) {}

  async sort(transactions: GQLEdgeInterface[]): Promise<GQLEdgeInterface[]> {
    const copy = [...transactions];
    const addKeysFuncs = copy.map((tx) => this.addSortKey(tx));
    await Promise.all(addKeysFuncs);

    return copy.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }

  private async addSortKey(txInfo: GQLEdgeInterface) {
    const { node } = txInfo;

    txInfo.sortKey = await this.createSortKey(node.block.id, node.id, node.block.height);
  }

  public async createSortKey(blockId: string, transactionId: string, blockHeight: number) {
    const blockHashBytes = this.arweave.utils.b64UrlToBuffer(blockId);
    const txIdBytes = this.arweave.utils.b64UrlToBuffer(transactionId);
    const concatenated = this.arweave.utils.concatBuffers([blockHashBytes, txIdBytes]);
    const hashed = arrayToHex(await this.arweave.crypto.hash(concatenated));
    const blockHeightString = `000000${blockHeight}`.slice(-12);

    return `${blockHeightString},${hashed}`;
  }
}
