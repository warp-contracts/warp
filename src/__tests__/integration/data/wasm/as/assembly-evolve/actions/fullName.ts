import { ContractResultSchema } from '../contract';
import { ActionSchema, StateSchema } from '../schemas';
import { console } from '../imports';

export function fullName(state: StateSchema, action: ActionSchema): ContractResultSchema {
  console.log(`fullName called: "${action.function}"`);
  console.log(`${state.firstName} ${state.lastName}`);
  return {
    state,
    result: {
      fullName: `${state.firstName} ${state.lastName}`
    }
  };
}
