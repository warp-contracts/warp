import { ActionSchema, StateSchema } from '../schemas';
import { ContractResultSchema } from '../contract';

export function increment(state: StateSchema, action: ActionSchema): ContractResultSchema {
  state.counter++;

  return {
    state,
    result: null
  };
}
