import { ExecutionContext } from '@smartweave';

/**
 * really not a fan of this feature...
 *
 * This adds ability to modify current execution context based
 * on state - example (and currently only) use case is the "evolve" feature...
 */
export interface ExecutionContextModifier<State> {
  modify(state: State, executionContext: ExecutionContext<State, any>): Promise<ExecutionContext<State, any>>;
}
