import { EvaluationOptions, GQLEdgeInterface } from '@smartweave';
import { Readable, Stream } from 'stream';

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
    evaluationOptions?: EvaluationOptions
  ): Promise<GQLEdgeInterface[] | Readable>;
}
