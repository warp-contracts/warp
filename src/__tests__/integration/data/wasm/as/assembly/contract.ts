// common imports - do not remove (even if IDE reports as non-used)!
import {
  Block,
  console,
  Contract,
  ContractFn,
  HandlerResultSchema,
  SmartWeaveSchema,
  parse,
  stringify,
  Transaction
} from "./imports";

// contract specific imports
import {increment} from "./actions/increment";
import {decrement} from "./actions/decrement";
import {fullName} from "./actions/fullName";
import {foreignRead} from "./actions/foreignRead";
import {infLoop} from "./actions/infLoop";
import {ActionSchema, ResultSchema, StateSchema} from "./schemas";

const functions: Map<string, ContractFn<StateSchema, ActionSchema, ResultSchema>> = new Map();
functions.set("increment", increment);
functions.set("decrement", decrement);
functions.set("fullName", fullName);
functions.set("foreignRead", foreignRead);
functions.set("infLoop", infLoop);

export type ContractResultSchema = HandlerResultSchema<StateSchema, ResultSchema>;

let contractState: StateSchema;

@contract
function handle(state: StateSchema, action: ActionSchema): ResultSchema | null {
  console.log(`Function called: "${action.function}"`);
  console.logO(`SmartWeave:`, stringify<SmartWeaveSchema>({
    contract: {
      id: Contract.id(),
      owner: Contract.owner()
    },
    block: {
      height: Block.height(),
      indep_hash: Block.indep_hash(),
      timestamp: Block.timestamp()
    },
    transaction: {
      id: Transaction.id(),
      owner: Transaction.owner(),
      target: Transaction.target()
    }
  }));

  const fn = action.function;
  if (functions.has(fn)) {
    const handlerResult = functions.get(fn)(state, action);
    if (handlerResult.state != null) {
      contractState = handlerResult.state!;
    }
    if (handlerResult.result != null) {
      console.logO(`Result:`, stringify<ResultSchema>(handlerResult.result!))
    }
    return handlerResult.result;
  } else {
    throw new Error(`[RE:WTF] Unknown function ${action.function}`);
  }
}
