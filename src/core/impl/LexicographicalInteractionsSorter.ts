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

    const blockHashBytes = this.arweave.utils.b64UrlToBuffer(node.block.id);
    const txIdBytes = this.arweave.utils.b64UrlToBuffer(node.id);
    const concatenated = this.arweave.utils.concatBuffers([blockHashBytes, txIdBytes]);
    const hashed = arrayToHex(await this.arweave.crypto.hash(concatenated));
    const blockHeight = `000000${node.block.height}`.slice(-12);

    txInfo.sortKey = `${blockHeight},${hashed}`;
  }
}
