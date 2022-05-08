import { EvaluationOptions, GQLEdgeInterface } from '@smartweave';
import { CustomError } from '@smartweave/utils';

// TODO: Update tests at `src/__tests__/unit/gateway-interactions.loader.test.ts:140 & 151` to use
// this instead of comparing with error's message.
export type InteractionsLoaderErrorKind = 'BadGatewayResponse500' | 'BadGatewayResponse504' | 'BadGatewayResponse';
export class InteractionsLoaderError extends CustomError<InteractionsLoaderErrorKind> {}

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
