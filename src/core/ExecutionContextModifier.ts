import { EvolveCompatibleState, ExecutionContext } from '@smartweave';

/**
 * really not a fan of this feature...
 *
 * This adds ability to modify current execution context based
 * on state - example (and currently only) use case is the "evolve" feature...
 */
export interface ExecutionContextModifier {
  modify<State>(state: State, executionContext: ExecutionContext<State>): Promise<ExecutionContext<State>>;
}
