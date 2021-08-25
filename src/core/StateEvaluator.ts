import { ExecutionContext, GQLNodeInterface, HandlerApi } from '@smartweave';

/**
 * Implementors of this class are responsible for evaluating contract's state
 * - based on the execution context.
 */
export interface StateEvaluator<State = unknown, Api = unknown> {
  eval(
    executionContext: ExecutionContext<State, Api>,
    currentTx: { interactionTxId: string; contractTxId: string }[]
  ): Promise<EvalStateResult<State>>;

  onStateUpdate(
    currentInteraction: GQLNodeInterface,
    executionContext: ExecutionContext<State, HandlerApi<State>>,
    state: EvalStateResult<State>
  );
}

export class EvalStateResult<State = unknown> {
  constructor(readonly state: State, readonly validity: Record<string, boolean>) {}
}

// tslint:disable-next-line:max-classes-per-file
export class DefaultEvaluationOptions implements EvaluationOptions {
  // default = false - "fail-fast" approach, otherwise we can end-up with a broken state and
  // not even notice that there was an exception in state evaluation.
  // Current SDK version simply moves to next interaction in this case and ignores exception
  // - I believe this is not a proper behaviour.
  ignoreExceptions = true;
}

// an interface for the contract EvaluationOptions - can be used to change the behaviour of some of the features.
export interface EvaluationOptions {
  // whether exceptions from given transaction interaction should be ignored
  ignoreExceptions: boolean;
}
