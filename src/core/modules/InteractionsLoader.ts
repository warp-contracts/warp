import { EvaluationOptions, GQLEdgeInterface } from '@warp';
import { Err, AppError } from '@warp/utils';
import { Result } from 'neverthrow';

export type BadGatewayResponse = Err<'BadGatewayResponse'> & {
  status: number;
};

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
  ): Promise<Result<GQLEdgeInterface[], AppError<BadGatewayResponse>>>;
}
