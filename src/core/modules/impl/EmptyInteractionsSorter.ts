import { GQLEdgeInterface, InteractionsSorter } from '@warp';

/**
 * An implementation of {@link InteractionsSorter} that is meant to be used
 * with Warp gateway (or any other gateway, that returns interactions
 * sorted according to the protocol specs)
 */
export class EmptyInteractionsSorter implements InteractionsSorter {
  async sort(transactions: GQLEdgeInterface[]): Promise<GQLEdgeInterface[]> {
    return transactions;
  }
}
