import {ActionSchema, StateSchema} from '../schemas';
import {Transaction} from '../imports/smartweave/transaction';
import {Contract} from '../imports';
import {ContractResultSchema} from '../contract';

export function evolve(
  state: StateSchema,
  action: ActionSchema
): ContractResultSchema {
  const evolve = action.value;
  const contractOwner = Contract.owner();
  const sender = Transaction.owner();

  if (sender != contractOwner) {
    throw new Error(
      '[CE:EPE] Evolve permissions error - only contract owner can evolve'
    );
  }

  if (!state.canEvolve) {
    throw new Error('[CE:ECE] Evolve not allowed');
  }

  state.evolve = evolve;

  return {
    state,
    result: null,
  };
}