import {ActionSchema, StateSchema} from '../schemas';
import {ContractResultSchema} from '../contract';

export function decrement(state: StateSchema, action: ActionSchema): ContractResultSchema {
  state.counter -= 555;

  return {
    state,
    result: null
  };
}
