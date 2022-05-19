import { GQLEdgeInterface } from '@warp';

/**
 * this is probably self-explanatory ;-)
 */
export interface InteractionsSorter {
  sort(transactions: GQLEdgeInterface[]): Promise<GQLEdgeInterface[]>;
}
