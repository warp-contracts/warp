import { ActionSchema, StateSchema } from '../schemas';
import { ContractResultSchema } from '../contract';

export function infLoop(state: StateSchema, action: ActionSchema): ContractResultSchema {
  while (true) {}

  return {
    state,
    result: null
  };
}
