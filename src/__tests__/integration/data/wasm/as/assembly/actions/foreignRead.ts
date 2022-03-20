import { ActionSchema, StateSchema } from '../schemas';
import { readContractState } from '../imports/api';
import { console } from '../imports/console';
import { ContractResultSchema } from '../contract';

@serializable
class ForeignContract {
  contractTxId: string;
}

// closures in AS work only for top-level module variables
let foreignState: string | null = null;

export function foreignRead(state: StateSchema, action: ActionSchema): ContractResultSchema {
  const contractTxId = action.contractTxId;

  readContractState((result: string) => {
    console.log(`Result ${result}`);
    foreignState = result;
    //foreignState = parse<ForeignContract>(result);
  }, <string>contractTxId);

  console.log('Waiting for foreign state');
  // FIXME: how to synchronize this...without using asyncify...
  // https://github.com/GoogleChromeLabs/asyncify#webassembly-side

  return {
    state,
    result: null
  };
}

function wait(state: StateSchema): ContractResultSchema {
  if (foreignState == null) {
    return wait(state);
  } else {
    console.log(`Got response`);
    return {
      state,
      result: null
    };
  }
}
