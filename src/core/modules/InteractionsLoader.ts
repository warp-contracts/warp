import { EvaluationOptions, GQLEdgeInterface } from '@warp';

/**
 * Implementors of this interface add functionality of loading contract's interaction transactions.
 * These transactions are then used to evaluate contract's state to a required block height.
 *
 * Note: InteractionsLoaders are not responsible for sorting interaction transactions!
 */
export interface InteractionsLoader {
  load(
    contractId: string,
    fromBlockHeight: number,
    toBlockHeight: number,
    evaluationOptions?: EvaluationOptions,
    upToTransactionId?: string
  ): Promise<GQLEdgeInterface[]>;
}
