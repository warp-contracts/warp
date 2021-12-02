import { EvalStateResult } from '@smartweave';

// note: only arrays are guaranteed to be stringified in a particular order.
export type StateCache<State> = EvalStateResult<State>[];
