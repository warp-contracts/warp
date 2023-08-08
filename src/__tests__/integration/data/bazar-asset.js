// src/write/constructor.js
function constructor(state, action) {
  if (action.input.args) {
    state = action.input.args;
  }
  if (!state.claimable) {
    state.claimable = [];
  }
  if (!state.balances) {
    state.balances = {};
  }
  if (!action.input?.args?.balances) {
    state.balances[action.caller] = 100;
  }
  state.name = action.input?.args?.name ? action.input.args.name : "AtomicAsset";
  state.ticker = action.input?.args?.ticker ? action.input.args.ticker : "AA";
  return { state };
}

// src/lib/either.js
var Right = (x) => ({
  isLeft: false,
  chain: (f) => f(x),
  ap: (other) => other.map(x),
  alt: (other) => Right(x),
  extend: (f) => f(Right(x)),
  concat: (other) => other.fold(
    (x2) => other,
    (y) => Right(x.concat(y))
  ),
  traverse: (of2, f) => f(x).map(Right),
  map: (f) => Right(f(x)),
  fold: (_, g) => g(x),
  toString: () => `Right(${x})`,
  extract: () => x
});
var Left = (x) => ({
  isLeft: true,
  chain: (_) => Left(x),
  ap: (_) => Left(x),
  extend: (_) => Left(x),
  alt: (other) => other,
  concat: (_) => Left(x),
  traverse: (of2, _) => of2(Left(x)),
  map: (_) => Left(x),
  fold: (f, _) => f(x),
  toString: () => `Left(${x})`,
  extract: () => x
});
var of = Right;
var fromNullable = (x) => x != null ? Right(x) : Left(x);

// src/read/balance.js
var balance = (state, action) => of({ state, action }).chain(validate).map(readBalance);
function validate({ state, action }) {
  if (!action.input.target) {
    action.input.target = action.caller;
  }
  if (action.input.target.length !== 43) {
    return Left("Target is not valid");
  }
  return Right({ state, action });
}
function readBalance({ state, action }) {
  return {
    result: {
      target: action.input.target,
      balance: state.balances[action.input.target] || 0
    }
  };
}

// src/write/allow.js
var allow = (state, action) => of({ state, action }).chain(validate2).map(update);
function update({ state, action }) {
  state.balances[action.caller] -= action.input.qty;
  if (!state.claimable) {
    state.claimable = [];
  }
  state.claimable.push({
    from: action.caller,
    to: action.input.target,
    qty: action.input.qty,
    txID: SmartWeave.transaction.id
  });
  return { state };
}
function validate2({ state, action }) {
  if (!Number.isInteger(action.input.qty) || action.input.qty === void 0) {
    return Left("Invalid value for quantity. Must be an integer.");
  }
  if (!action?.input?.target) {
    return Left("No target specified.");
  }
  if (action.input.target.length !== 43) {
    return Left("Target is not valid!");
  }
  if (action.input.target === SmartWeave.transaction.id) {
    return Left("Cant setup claim to transfer a balance to itself");
  }
  if (action.caller === action.input.target) {
    return Left("Invalid balance transfer");
  }
  if (!state.balances[action.caller]) {
    return Left("Caller does not have a balance");
  }
  if (state.balances[action.caller] < action.input.qty) {
    return Left("Caller balance is not high enough.");
  }
  return Right({ state, action });
}

// src/write/claim.js
var claim = (state, action) => of({ state, action }).chain(validate3).map(update2);
function update2({ state, action, idx }) {
  if (!state.balances[action.caller]) {
    state.balances[action.caller] = 0;
  }
  state.balances[action.caller] += action.input.qty;
  state.claimable.splice(idx, 1);
  return { state };
}
function validate3({ state, action }) {
  if (!action.input.txID) {
    return Left("txID is not found.");
  }
  if (!action.input.qty) {
    return Left("claim quantity is not specified.");
  }
  const idx = state.claimable.findIndex(
    (c) => c.txID === action.input.txID
  );
  if (idx < 0) {
    return Left("claimable not found.");
  }
  if (state.claimable[idx].qty !== action.input.qty) {
    return Left("claimable qty is not equal to claim qty.");
  }
  if (state.claimable[idx].to !== action.caller) {
    return Left("claim is not addressed to caller.");
  }
  return Right({ state, action, idx });
}

// src/write/transfer.js
var transfer = (state, action) => of({ state, action }).chain(validate4).map(update3);
function update3({ state, action }) {
  state.balances[action.caller] -= action.input.qty;
  state.balances[action.input.target] += action.input.qty;
  return { state };
}
function validate4({ state, action }) {
  if (!action.caller || action.caller.length !== 43) {
    return Left("Caller is not valid");
  }
  if (!action.input.qty || typeof action.input.qty !== "number") {
    return Left("qty is not defined or is not a number");
  }
  if (!action.input.target || action.input.target.length !== 43) {
    return Left("target is not valid");
  }
  if (action.caller === action.input.target) {
    return Left("target cannot be caller");
  }
  if (!state.balances[action.input.target]) {
    state.balances[action.input.target] = 0;
  }
  if (!state.balances[action.caller]) {
    state.balances[action.caller] = 0;
  }
  if (state.balances[action.caller] < action.input.qty) {
    return Left("not enough balance to transfer");
  }
  return Right({ state, action });
}

// src/write/reject.js
function reject(state, action) {
  return fromNullable({ state, action }).chain(validate5).map(update4);
}
function update4({ state, action }) {
  const claim2 = state.claimable.find((c) => c.txID === action.input.tx);
  if (!state.balances[claim2.from]) {
    state.balances[claim2.from] = 0;
  }
  state.balances[claim2.from] += claim2.qty;
  state.claimable = state.claimable.filter((c) => c.txID !== claim2.txID);
  return { state };
}
function validate5({ state, action }) {
  if (!action.input.tx) {
    return Left("tx is required!");
  }
  if (!action.input.qty) {
    return Left("qty is required!");
  }
  if (action.input.tx.length !== 43) {
    return Left("tx is not valid");
  }
  if (!Number.isInteger(action.input.qty)) {
    return Left("qty must be an integer");
  }
  if (state.claimable.filter((c) => c.txID === action.input.tx).length !== 1) {
    return Left("claim not found");
  }
  if (state.claimable.filter((c) => c.txID === action.input.tx)[0]?.to !== action.caller) {
    return Left("claim in not addressed to caller");
  }
  return Right({ state, action });
}

// src/contract.js
export async function handle(state, action) {
  switch (action.input?.function) {
    case "noop":
      return { state };
    case "__init":
      return constructor(state, action);
    case "balance":
      return balance(state, action).fold(handleError, identity);
    case "transfer":
      return transfer(state, action).fold(handleError, identity);
    case "allow":
      return allow(state, action).fold(handleError, identity);
    case "reject":
      return reject(state, action).fold(handleError, identity);
    case "claim":
      return claim(state, action).fold(handleError, identity);
    default:
      throw new ContractError("Function not found");
  }
}
function identity(v) {
  return v;
}
function handleError(msg) {
  throw new ContractError(msg);
}
