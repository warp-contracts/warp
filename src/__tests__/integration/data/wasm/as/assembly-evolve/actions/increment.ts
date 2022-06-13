import { ActionSchema, StateSchema } from '../schemas';
import { ContractResultSchema } from '../contract';

export function increment(state: StateSchema, action: ActionSchema): ContractResultSchema {
  state.counter += 2;

  return {
    state,
    result: null,
  };
}
