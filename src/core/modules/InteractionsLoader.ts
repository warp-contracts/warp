import { CustomError, EvaluationOptions, GQLEdgeInterface } from '@smartweave';

// TODO: Update tests at `src/__tests__/unit/gateway-interactions.loader.test.ts:140 & 151` to use
// this instead of comparing with error's message.
export type InteractionLoaderErrorKind = 'BadGatewayResponse500' | 'BadGatewayResponse504' | 'BadGatewayResponse';
export class InteractionLoaderError extends CustomError<InteractionLoaderErrorKind> {}

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
