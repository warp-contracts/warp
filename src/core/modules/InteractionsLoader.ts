import { EvaluationOptions, GQLNodeInterface } from '@smartweave';

/**
 * Implementors of this interface add functionality of loading contract's interaction transactions.
 * Returned interactions MUST be sorted according to protocol specification ({@link LexicographicalInteractionsSorter}
 */
export interface InteractionsLoader {
  /**
   * This method loads interactions for a given contract.
   * If param fromSortKey and/or param toSortKey are present, the loaded interactions should
   * conform the condition: i.sortKey > fromSortKey && i.sortKey <= toSortKey
   *
   * @param contractTxId - contract tx id to load the interactions
   * @param fromSortKey - exclusive, optional - sortKey, from which the interactions should be loaded
   * @param toSortKey - inclusive, optional - sortKey, to which then interactions should be loaded
   * @param evaluationOptions, optional - {@link EvaluationOptions}
   */
  load(
    contractTxId: string,
    fromSortKey?: string,
    toSortKey?: string,
    evaluationOptions?: EvaluationOptions
  ): Promise<GQLNodeInterface[]>;
}
