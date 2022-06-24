import { EvaluationOptions, GQLEdgeInterface } from '@warp';
import { CustomError, Err } from '@warp/utils';

// Make this error case individual as it is also used in `src/contract/Contract.ts`.
export type BadGatewayResponse = Err<'BadGatewayResponse'> & { status: number };

// InteractionsLoaderErrorDetail is effectively only an alias to BadGatewayResponse but it could
// also include other kinds of errors in the future.
export type InteractionsLoaderErrorDetail = BadGatewayResponse;
export class InteractionsLoaderError extends CustomError<InteractionsLoaderErrorDetail> {}

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
