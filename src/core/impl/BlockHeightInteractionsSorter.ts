import { GQLEdgeInterface, InteractionsSorter } from '@smartweave';

/**
 * an implementation based on https://github.com/ArweaveTeam/SmartWeave/pull/82
 */
export class BlockHeightInteractionsSorter implements InteractionsSorter {
  async sort(transactions: GQLEdgeInterface[]): Promise<GQLEdgeInterface[]> {
    const copy = [...transactions];

    return copy.sort(
      (a: GQLEdgeInterface, b: GQLEdgeInterface) =>
        a.node.block.height - b.node.block.height || a.node.id.localeCompare(b.node.id)
    );
  }
}
