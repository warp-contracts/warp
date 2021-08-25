import { ExecutionContext, GQLNodeInterface, HandlerApi } from '@smartweave';

/**
 * Implementors of this class are responsible for evaluating contract's state
 * - based on the execution context.
 */
export interface StateEvaluator {
  eval<State>(
    executionContext: ExecutionContext<State>,
    currentTx: { interactionTxId: string; contractTxId: string }[]
  ): Promise<EvalStateResult<State>>;

  onStateUpdate<State>(
    currentInteraction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>
  );
}

export class EvalStateResult<State> {
  constructor(readonly state: State, readonly validity: Record<string, boolean>) {}
}

// tslint:disable-next-line:max-classes-per-file
export class DefaultEvaluationOptions implements EvaluationOptions {
  // default = true - still cannot decide whether true or false should be the default
  // "false" may lead to some fairly simple attacks on contract, if the contract
  // does not properly validate input data
  // "true" may lead to wrongly calculated state, even without noticing..
  ignoreExceptions = true;
}

// an interface for the contract EvaluationOptions - can be used to change the behaviour of some of the features.
export interface EvaluationOptions {
  // whether exceptions from given transaction interaction should be ignored
  ignoreExceptions: boolean;
}
