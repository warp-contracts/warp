import { GQLEdgeInterface } from '@smartweave';

/**
 * this is probably self-explanatory ;-)
 */
export interface InteractionsSorter {
  sort(transactions: GQLEdgeInterface[]): Promise<GQLEdgeInterface[]>;
}
