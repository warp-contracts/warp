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

// src/write/add-pair.js
function addPair(state, action) {
  return of({ state, action }).chain(validate).map(updatePairs);
}
function updatePairs({ state, action }) {
  state.pairs.push({
    pair: action.input.pair,
    orders: []
  });
  return { state };
}
function validate({ state, action }) {
  if (!state.pairs) {
    state.pairs = [];
  }
  if (!action.input.pair) {
    return Left("pair is required");
  }
  if (!action.input.pair[0].length === 43) {
    return Left("Each pair must be a contract address");
  }
  if (!action.input.pair[1].length === 43) {
    return Left("Each pair must be a contract address");
  }
  if (state.pairs.find(
    ({ pair: existingPair }) => existingPair.includes(action.input.pair[0]) && existingPair.includes(action.input.pair[1])
  )) {
    return Left("Pair already exists");
  }
  return Right({ state, action });
}

// src/lib/streak-calc.js
function calculateStreak(lastHeight = 0, currentHeight = 0, streak = 0) {
  if (streak === 0) {
    return { days: 1, lastHeight: currentHeight };
  }
  if (streak >= 30) {
    return { days: 1, lastHeight: currentHeight };
  }
  const diff = currentHeight - lastHeight;
  if (diff <= 720) {
    return { days: streak, lastHeight };
  }
  if (diff > 720 && diff <= 1440) {
    return { days: streak + 1, lastHeight: currentHeight };
  }
  if (diff > 1440) {
    return { days: 1, lastHeight: currentHeight };
  }
  return { days: 0, lastHeight: 0 };
}

// src/write/create-order.js
var U = "KTzTXT_ANmF84fWEKHzWURD1LWd9QaFR9yfYUwH2Lxw";
var CreateOrder = async (state, action) => {
  U = state.U;
  const caller = action.caller;
  const input = action.input;
  const pairs = state.pairs;
  const usedPair = input.pair;
  const qty = input.qty;
  const price = input.price;
  const max = input?.max || Number.MAX_SAFE_INTEGER;
  let tokenTx = input.transaction;
  let balances = state.balances;
  ContractAssert(
    isAddress(usedPair[0]) && isAddress(usedPair[1]),
    "One of two supplied pair tokens is invalid"
  );
  if (price) {
    ContractAssert(typeof price === "number", "Price must be a number");
    ContractAssert(
      price === void 0 || price === null || price > 0,
      "Price must be greater than 0"
    );
  }
  if (!Number.isInteger(qty) || qty === void 0) {
    throw new ContractError("Invalid value for quantity. Must be an integer.");
  }
  let contractID = usedPair[0];
  if (contractID === SmartWeave.contract.id) {
    tokenTx = "INTERNAL_TRANSFER";
    if (qty <= 0 || caller === SmartWeave.contract.id) {
      throw new ContractError("Invalid token transfer.");
    }
    if (balances[caller] < qty) {
      throw new ContractError(
        "Caller balance not high enough to send " + qty + " token(s)."
      );
    }
    balances[caller] -= qty;
    if (SmartWeave.contract.id in balances) {
      balances[SmartWeave.contract.id] += qty;
    } else {
      balances[SmartWeave.contract.id] = qty;
    }
  } else if (usedPair[1] === SmartWeave.contract.id && tokenTx === "INTERNAL_TRANSFER") {
  } else {
    if (tokenTx === void 0 || tokenTx === null) {
      throw new ContractError(
        "No token transaction provided given the token in the order is from a different contract"
      );
    }
    await claimBalance(contractID, tokenTx, qty);
  }
  const refundTransfer = async () => {
    if (contractID === SmartWeave.contract.id) {
      balances[SmartWeave.contract.id] -= qty;
      if (caller in balances) {
        balances[caller] += qty;
      } else {
        balances[caller] = qty;
      }
    } else {
      await SmartWeave.contracts.write(contractID, {
        function: "transfer",
        target: caller,
        qty
      });
    }
  };
  let pairIndex = -1;
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].pair[0] === usedPair[0] && pairs[i].pair[1] === usedPair[1] || pairs[i].pair[0] === usedPair[1] && pairs[i].pair[1] === usedPair[0]) {
      pairIndex = i;
    }
  }
  if (pairIndex === -1) {
    await refundTransfer();
    return {
      state,
      result: {
        status: "failure",
        message: "This pair does not exist yet"
      }
    };
  }
  let sortedOrderbook;
  if (state.pairs[pairIndex].orders.length > 0) {
    sortedOrderbook = state.pairs[pairIndex].orders.sort(
      (a, b) => a.price > b.price ? 1 : -1
    );
  } else {
    sortedOrderbook = [];
  }
  const dominantToken = state.pairs[pairIndex].pair[0];
  try {
    const { orderbook, foreignCalls, matches } = matchOrder(
      {
        pair: {
          dominant: dominantToken,
          from: contractID,
          to: usedPair.find((val) => val !== contractID)
        },
        quantity: qty,
        creator: caller,
        transaction: SmartWeave.transaction.id,
        transfer: tokenTx,
        price
      },
      sortedOrderbook
    );
    const maxPrice = matches.reduce((a, v) => v.price > a ? v.price : a, 0);
    if (maxPrice > max) {
      throw new Error("can not purchase item it is greater than max bid");
    }
    state.pairs[pairIndex].orders = orderbook;
    if (matches.length > 0) {
      const vwap = matches.map(({ qty: volume, price: price2 }) => volume * price2).reduce((a, b) => a + b, 0) / matches.map(({ qty: volume }) => volume).reduce((a, b) => a + b, 0);
      state.pairs[pairIndex].priceData = {
        dominantToken,
        block: SmartWeave.block.height,
        vwap,
        matchLogs: matches
      };
    } else {
      state.pairs[pairIndex].priceData = void 0;
    }
    for (let i = 0; i < foreignCalls.length; i++) {
      if (foreignCalls[i].input.qty <= 0) {
        continue;
      }
      if (foreignCalls[i].contract === SmartWeave.contract.id) {
        balances[SmartWeave.contract.id] -= foreignCalls[i].input.qty;
        if (foreignCalls[i].input.target in balances) {
          balances[foreignCalls[i].input.target] += foreignCalls[i].input.qty;
        } else {
          balances[foreignCalls[i].input.target] = foreignCalls[i].input.qty;
        }
      } else {
        if (foreignCalls[i].contract !== U) {
          const buyer = foreignCalls[i].input.target;
          if (!state.streaks[buyer]) {
            state.streaks[buyer] = { days: 0, lastHeight: 0 };
          }
          const streakUpdate = calculateStreak(
            state.streaks[buyer].lastHeight,
            SmartWeave.block.height,
            state.streaks[buyer].days
          );
          state.streaks[buyer] = streakUpdate;
        }
        const result = await SmartWeave.contracts.write(
          foreignCalls[i].contract,
          foreignCalls[i].input
        );
        if (result.type !== "ok") {
          throw new ContractError(
            `Unable to fill order with txID: ${foreignCalls[i].txID}`
          );
        }
      }
    }
    if (state.balances) {
      state.balances = balances;
    }
    return {
      state,
      result: {
        status: "success",
        message: "Order created successfully"
      }
    };
  } catch (e) {
    await refundTransfer();
    return {
      state,
      result: {
        status: "failure",
        message: e.message
      }
    };
  }
};
function matchOrder(input, orderbook) {
  const orderType = input.price ? "limit" : "market";
  const foreignCalls = [];
  const matches = [];
  const reverseOrders = orderbook.filter(
    (order) => input.pair.from !== order.token && order.id !== input.transaction
  );
  if (!reverseOrders.length) {
    if (orderType !== "limit")
      throw new Error('The first order for a pair can only be a "limit" order');
    orderbook.push({
      id: input.transaction,
      transfer: input.transfer,
      creator: input.creator,
      token: input.pair.from,
      price: input.price,
      quantity: Math.round(input.quantity),
      originalQuantity: input.quantity
    });
    return {
      orderbook,
      foreignCalls,
      matches
    };
  }
  let fillAmount;
  let receiveAmount = 0;
  let remainingQuantity = input.quantity;
  const newOrderbook = orderbook.reduce((acc, currentOrder) => {
    if (input.pair.from === currentOrder.token || currentOrder.id === input.transaction) {
      acc.push(currentOrder);
      return acc;
    }
    const reversePrice = 1 / currentOrder.price;
    if (orderType === "limit" && input.price !== reversePrice) {
      acc.push(currentOrder);
      return acc;
    }
    ;
    fillAmount = Math.floor(remainingQuantity * (input.price ?? reversePrice));
    let receiveFromCurrent = 0;
    if (fillAmount <= currentOrder.quantity) {
      receiveFromCurrent = Math.floor(remainingQuantity * reversePrice);
      currentOrder.quantity -= fillAmount;
      receiveAmount += receiveFromCurrent;
      if (remainingQuantity > 0) {
        foreignCalls.push({
          txID: SmartWeave.transaction.id,
          contract: input.pair.from,
          input: {
            function: "transfer",
            target: currentOrder.creator,
            qty: Math.round(remainingQuantity * 0.995)
          }
        });
      }
      remainingQuantity = 0;
    } else {
      receiveFromCurrent = currentOrder.quantity;
      receiveAmount += receiveFromCurrent;
      const sendAmount = receiveFromCurrent * currentOrder.price;
      remainingQuantity -= sendAmount;
      foreignCalls.push({
        txID: SmartWeave.transaction.id,
        contract: input.pair.from,
        input: {
          function: "transfer",
          target: currentOrder.creator,
          qty: input.pair.from === Math.round(sendAmount * 0.995)
        }
      });
      currentOrder.quantity = 0;
    }
    let dominantPrice = 0;
    if (input.pair.dominant === input.pair.from) {
      dominantPrice = input.price ?? reversePrice;
    } else {
      dominantPrice = currentOrder.price;
    }
    if (receiveFromCurrent > 0) {
      matches.push({
        id: currentOrder.id,
        qty: receiveFromCurrent,
        price: dominantPrice
      });
    }
    if (currentOrder.quantity !== 0) {
      acc.push(currentOrder);
    }
    return acc;
  }, []);
  if (remainingQuantity > 0) {
    if (orderType === "limit") {
      newOrderbook.push({
        id: input.transaction,
        transfer: input.transfer,
        creator: input.creator,
        token: input.pair.from,
        price: input.price,
        quantity: Math.round(remainingQuantity),
        originalQuantity: input.quantity
      });
    } else {
      foreignCalls.push({
        txID: SmartWeave.transaction.id,
        contract: input.pair.from,
        input: {
          function: "transfer",
          target: input.creator,
          qty: remainingQuantity
        }
      });
    }
  }
  foreignCalls.push({
    txID: SmartWeave.transaction.id,
    contract: input.pair.to,
    input: {
      function: "transfer",
      target: input.creator,
      qty: Math.round(receiveAmount * 0.995)
    }
  });
  return {
    orderbook: newOrderbook,
    foreignCalls,
    matches
  };
}
var claimBalance = async (tokenID, transferTx, qty) => {
  const result = await SmartWeave.contracts.write(tokenID, {
    function: "claim",
    txID: transferTx,
    qty
  });
  if (result.type !== "ok") {
    throw new ContractError(`Unable to make claim with txID: ${transferTx}`);
  }
};
var isAddress = (addr) => /[a-z0-9_-]{43}/i.test(addr);

// src/write/cancel-order.js
var CancelOrder = async (state, action) => {
  const caller = action.caller;
  const input = action.input;
  const orderTxID = input.orderID;
  ContractAssert(isAddress2(orderTxID), "Invalid order ID");
  const allOrders = state.pairs.map((pair) => pair.orders).flat(1);
  const order = allOrders.find(({ id }) => id === orderTxID);
  ContractAssert(order !== void 0, "Order does not exist");
  ContractAssert(
    order.creator === caller,
    "Caller is not the creator of the order"
  );
  if (order.token === SmartWeave.contract.id) {
    state.balances[SmartWeave.contract.id] -= order.quantity;
    if (caller in state.balances) {
      state.balances[caller] += order.quantity;
    } else {
      state.balances[caller] = order.quantity;
    }
  } else {
    const result = await SmartWeave.contracts.write(order.token, {
      function: "transfer",
      target: caller,
      qty: order.quantity
    });
    if (result.type !== "ok") {
      throw new ContractError(
        `Unable to make claim with txID: ${SmartWeave.transaction.id}`
      );
    }
  }
  const acitvePair = state.pairs.find(
    (pair) => pair.orders.find(({ id }) => id === orderTxID)
  );
  acitvePair.orders = acitvePair.orders.filter(({ id }) => id !== orderTxID);
  return {
    state,
    result: {
      status: "success",
      message: "Order cancelled successfully"
    }
  };
};
var isAddress2 = (addr) => /[a-z0-9_-]{43}/i.test(addr);

// src/read/balance.js
function balance(state, action) {
  if (!action.input.target) {
    action.input.target = action.caller;
  }
  ContractAssert(
    /[a-z0-9_-]{43}/i.test(action.input.target),
    "Invalid Target!"
  );
  if (!state.balances[action.input.target]) {
    return {
      result: {
        target: action.input.target,
        balance: 0
      }
    };
  }
  return {
    result: {
      target: action.input.target,
      balance: state.balances[action.input.target]
    }
  };
}

// src/write/transfer.js
var transfer = (state, action) => of({ state, action }).chain(validate2).map(update);
function update({ state, action }) {
  state.balances[action.caller] -= action.input.qty;
  state.balances[action.input.target] += action.input.qty;
  return { state };
}
function validate2({ state, action }) {
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

// src/read/validate.js
function validate3(state) {
  ContractAssert(state.name, "Name is required!");
  ContractAssert(state.ticker, "Ticker is required!");
  ContractAssert(state.balances, "Balances Object is required!");
  ContractAssert(state.pairs, "Pairs Array is required!");
  ContractAssert(state.claimable, "Claimable Array is required!");
  ContractAssert(state.streaks, "Streaks Object is required!");
  ContractAssert(state.lastReward > -1, "Last Reward prop is required");
  ContractAssert(state.recentRewards, "Recent Rewards prop is required");
  ContractAssert(state.U, "U is required!");
}

// src/write/allow.js
var allow = (state, action) => of({ state, action }).chain(validate4).map(update2);
function update2({ state, action }) {
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
function validate4({ state, action }) {
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
var claim = (state, action) => of({ state, action }).chain(validate5).map(update3);
function update3({ state, action, idx }) {
  if (!state.balances[action.caller]) {
    state.balances[action.caller] = 0;
  }
  state.balances[action.caller] += action.input.qty;
  state.claimable.splice(idx, 1);
  return { state };
}
function validate5({ state, action }) {
  if (!action.input.txID) {
    return Left("txID is not found.");
  }
  if (!action.input.qty) {
    return Left("claim quantity is not specified.");
  }
  const idx = state.claimable.findIndex((c) => c.txID === action.input.txID);
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

// src/cron/buyback.js
var DUTCH = 1.01;
async function buyback(state) {
  const U2 = state.U;
  const uState = await SmartWeave.contracts.readContractState(U2);
  const uBalance = uState.balances[SmartWeave.contract.id] || 0;
  if (uBalance === 0) {
    return state;
  }
  let zAR_U = state.pairs.find(
    (p) => p.pair.includes(U2) && p.pair.includes(SmartWeave.contract.id)
  );
  if (!zAR_U) {
    state.pairs.push({
      pair: [SmartWeave.contract.id, U2],
      orders: [],
      priceData: {}
    });
    zAR_U = state.pairs.find(
      (p) => p.pair.includes(U2) && p.pair.includes(SmartWeave.contract.id)
    );
  }
  let response = null;
  const orderToUpdate = await zAR_U.orders.find((o) => o.creator === SmartWeave.contract.id);
  if (orderToUpdate) {
    let price = Math.floor(orderToUpdate.price * DUTCH);
    orderToUpdate.originalQuantity = uBalance;
    orderToUpdate.quantity = uBalance;
    orderToUpdate.price = price;
  } else {
    let price = zAR_U?.priceData?.vwap || 100;
    response = await CreateOrder(state, {
      caller: SmartWeave.contract.id,
      input: {
        pair: [U2, SmartWeave.contract.id],
        qty: uBalance,
        transaction: "INTERNAL_TRANSFER",
        price
      }
    });
  }
  if (response) {
    response.state.balances[SmartWeave.contract.id] = 0;
    if (response.result.status === "success") {
      return response.state;
    } else {
      return state;
    }
  } else {
    return state;
  }
}

// node_modules/ramda/es/internal/_isPlaceholder.js
function _isPlaceholder(a) {
  return a != null && typeof a === "object" && a["@@functional/placeholder"] === true;
}

// node_modules/ramda/es/internal/_curry1.js
function _curry1(fn) {
  return function f1(a) {
    if (arguments.length === 0 || _isPlaceholder(a)) {
      return f1;
    } else {
      return fn.apply(this, arguments);
    }
  };
}

// node_modules/ramda/es/internal/_curry2.js
function _curry2(fn) {
  return function f2(a, b) {
    switch (arguments.length) {
      case 0:
        return f2;
      case 1:
        return _isPlaceholder(a) ? f2 : _curry1(function(_b) {
          return fn(a, _b);
        });
      default:
        return _isPlaceholder(a) && _isPlaceholder(b) ? f2 : _isPlaceholder(a) ? _curry1(function(_a) {
          return fn(_a, b);
        }) : _isPlaceholder(b) ? _curry1(function(_b) {
          return fn(a, _b);
        }) : fn(a, b);
    }
  };
}

// node_modules/ramda/es/add.js
var add = /* @__PURE__ */ _curry2(function add2(a, b) {
  return Number(a) + Number(b);
});
var add_default = add;

// node_modules/ramda/es/internal/_arity.js
function _arity(n, fn) {
  switch (n) {
    case 0:
      return function() {
        return fn.apply(this, arguments);
      };
    case 1:
      return function(a0) {
        return fn.apply(this, arguments);
      };
    case 2:
      return function(a0, a1) {
        return fn.apply(this, arguments);
      };
    case 3:
      return function(a0, a1, a2) {
        return fn.apply(this, arguments);
      };
    case 4:
      return function(a0, a1, a2, a3) {
        return fn.apply(this, arguments);
      };
    case 5:
      return function(a0, a1, a2, a3, a4) {
        return fn.apply(this, arguments);
      };
    case 6:
      return function(a0, a1, a2, a3, a4, a5) {
        return fn.apply(this, arguments);
      };
    case 7:
      return function(a0, a1, a2, a3, a4, a5, a6) {
        return fn.apply(this, arguments);
      };
    case 8:
      return function(a0, a1, a2, a3, a4, a5, a6, a7) {
        return fn.apply(this, arguments);
      };
    case 9:
      return function(a0, a1, a2, a3, a4, a5, a6, a7, a8) {
        return fn.apply(this, arguments);
      };
    case 10:
      return function(a0, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
        return fn.apply(this, arguments);
      };
    default:
      throw new Error("First argument to _arity must be a non-negative integer no greater than ten");
  }
}

// node_modules/ramda/es/internal/_curryN.js
function _curryN(length, received, fn) {
  return function() {
    var combined = [];
    var argsIdx = 0;
    var left = length;
    var combinedIdx = 0;
    while (combinedIdx < received.length || argsIdx < arguments.length) {
      var result;
      if (combinedIdx < received.length && (!_isPlaceholder(received[combinedIdx]) || argsIdx >= arguments.length)) {
        result = received[combinedIdx];
      } else {
        result = arguments[argsIdx];
        argsIdx += 1;
      }
      combined[combinedIdx] = result;
      if (!_isPlaceholder(result)) {
        left -= 1;
      }
      combinedIdx += 1;
    }
    return left <= 0 ? fn.apply(this, combined) : _arity(left, _curryN(length, combined, fn));
  };
}

// node_modules/ramda/es/curryN.js
var curryN = /* @__PURE__ */ _curry2(function curryN2(length, fn) {
  if (length === 1) {
    return _curry1(fn);
  }
  return _arity(length, _curryN(length, [], fn));
});
var curryN_default = curryN;

// node_modules/ramda/es/internal/_curry3.js
function _curry3(fn) {
  return function f3(a, b, c) {
    switch (arguments.length) {
      case 0:
        return f3;
      case 1:
        return _isPlaceholder(a) ? f3 : _curry2(function(_b, _c) {
          return fn(a, _b, _c);
        });
      case 2:
        return _isPlaceholder(a) && _isPlaceholder(b) ? f3 : _isPlaceholder(a) ? _curry2(function(_a, _c) {
          return fn(_a, b, _c);
        }) : _isPlaceholder(b) ? _curry2(function(_b, _c) {
          return fn(a, _b, _c);
        }) : _curry1(function(_c) {
          return fn(a, b, _c);
        });
      default:
        return _isPlaceholder(a) && _isPlaceholder(b) && _isPlaceholder(c) ? f3 : _isPlaceholder(a) && _isPlaceholder(b) ? _curry2(function(_a, _b) {
          return fn(_a, _b, c);
        }) : _isPlaceholder(a) && _isPlaceholder(c) ? _curry2(function(_a, _c) {
          return fn(_a, b, _c);
        }) : _isPlaceholder(b) && _isPlaceholder(c) ? _curry2(function(_b, _c) {
          return fn(a, _b, _c);
        }) : _isPlaceholder(a) ? _curry1(function(_a) {
          return fn(_a, b, c);
        }) : _isPlaceholder(b) ? _curry1(function(_b) {
          return fn(a, _b, c);
        }) : _isPlaceholder(c) ? _curry1(function(_c) {
          return fn(a, b, _c);
        }) : fn(a, b, c);
    }
  };
}

// node_modules/ramda/es/internal/_isArray.js
var isArray_default = Array.isArray || function _isArray(val) {
  return val != null && val.length >= 0 && Object.prototype.toString.call(val) === "[object Array]";
};

// node_modules/ramda/es/internal/_isTransformer.js
function _isTransformer(obj) {
  return obj != null && typeof obj["@@transducer/step"] === "function";
}

// node_modules/ramda/es/internal/_dispatchable.js
function _dispatchable(methodNames, transducerCreator, fn) {
  return function() {
    if (arguments.length === 0) {
      return fn();
    }
    var obj = arguments[arguments.length - 1];
    if (!isArray_default(obj)) {
      var idx = 0;
      while (idx < methodNames.length) {
        if (typeof obj[methodNames[idx]] === "function") {
          return obj[methodNames[idx]].apply(obj, Array.prototype.slice.call(arguments, 0, -1));
        }
        idx += 1;
      }
      if (_isTransformer(obj)) {
        var transducer = transducerCreator.apply(null, Array.prototype.slice.call(arguments, 0, -1));
        return transducer(obj);
      }
    }
    return fn.apply(this, arguments);
  };
}

// node_modules/ramda/es/internal/_xfBase.js
var xfBase_default = {
  init: function() {
    return this.xf["@@transducer/init"]();
  },
  result: function(result) {
    return this.xf["@@transducer/result"](result);
  }
};

// node_modules/ramda/es/internal/_has.js
function _has(prop, obj) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

// node_modules/ramda/es/internal/_isArguments.js
var toString = Object.prototype.toString;
var _isArguments = /* @__PURE__ */ function() {
  return toString.call(arguments) === "[object Arguments]" ? function _isArguments2(x) {
    return toString.call(x) === "[object Arguments]";
  } : function _isArguments2(x) {
    return _has("callee", x);
  };
}();
var isArguments_default = _isArguments;

// node_modules/ramda/es/keys.js
var hasEnumBug = !/* @__PURE__ */ {
  toString: null
}.propertyIsEnumerable("toString");
var nonEnumerableProps = ["constructor", "valueOf", "isPrototypeOf", "toString", "propertyIsEnumerable", "hasOwnProperty", "toLocaleString"];
var hasArgsEnumBug = /* @__PURE__ */ function() {
  "use strict";
  return arguments.propertyIsEnumerable("length");
}();
var contains = function contains2(list, item) {
  var idx = 0;
  while (idx < list.length) {
    if (list[idx] === item) {
      return true;
    }
    idx += 1;
  }
  return false;
};
var keys = typeof Object.keys === "function" && !hasArgsEnumBug ? /* @__PURE__ */ _curry1(function keys2(obj) {
  return Object(obj) !== obj ? [] : Object.keys(obj);
}) : /* @__PURE__ */ _curry1(function keys3(obj) {
  if (Object(obj) !== obj) {
    return [];
  }
  var prop, nIdx;
  var ks = [];
  var checkArgsLength = hasArgsEnumBug && isArguments_default(obj);
  for (prop in obj) {
    if (_has(prop, obj) && (!checkArgsLength || prop !== "length")) {
      ks[ks.length] = prop;
    }
  }
  if (hasEnumBug) {
    nIdx = nonEnumerableProps.length - 1;
    while (nIdx >= 0) {
      prop = nonEnumerableProps[nIdx];
      if (_has(prop, obj) && !contains(ks, prop)) {
        ks[ks.length] = prop;
      }
      nIdx -= 1;
    }
  }
  return ks;
});
var keys_default = keys;

// node_modules/ramda/es/type.js
var type = /* @__PURE__ */ _curry1(function type2(val) {
  return val === null ? "Null" : val === void 0 ? "Undefined" : Object.prototype.toString.call(val).slice(8, -1);
});
var type_default = type;

// node_modules/ramda/es/internal/_map.js
function _map(fn, functor) {
  var idx = 0;
  var len = functor.length;
  var result = Array(len);
  while (idx < len) {
    result[idx] = fn(functor[idx]);
    idx += 1;
  }
  return result;
}

// node_modules/ramda/es/internal/_toISOString.js
var pad = function pad2(n) {
  return (n < 10 ? "0" : "") + n;
};
var _toISOString = typeof Date.prototype.toISOString === "function" ? function _toISOString2(d) {
  return d.toISOString();
} : function _toISOString3(d) {
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds()) + "." + (d.getUTCMilliseconds() / 1e3).toFixed(3).slice(2, 5) + "Z";
};

// node_modules/ramda/es/internal/_arrayReduce.js
function _arrayReduce(reducer, acc, list) {
  var index = 0;
  var length = list.length;
  while (index < length) {
    acc = reducer(acc, list[index]);
    index += 1;
  }
  return acc;
}

// node_modules/ramda/es/internal/_xmap.js
var XMap = /* @__PURE__ */ function() {
  function XMap2(f, xf) {
    this.xf = xf;
    this.f = f;
  }
  XMap2.prototype["@@transducer/init"] = xfBase_default.init;
  XMap2.prototype["@@transducer/result"] = xfBase_default.result;
  XMap2.prototype["@@transducer/step"] = function(result, input) {
    return this.xf["@@transducer/step"](result, this.f(input));
  };
  return XMap2;
}();
var _xmap = function _xmap2(f) {
  return function(xf) {
    return new XMap(f, xf);
  };
};
var xmap_default = _xmap;

// node_modules/ramda/es/map.js
var map = /* @__PURE__ */ _curry2(
  /* @__PURE__ */ _dispatchable(["fantasy-land/map", "map"], xmap_default, function map2(fn, functor) {
    switch (Object.prototype.toString.call(functor)) {
      case "[object Function]":
        return curryN_default(functor.length, function() {
          return fn.call(this, functor.apply(this, arguments));
        });
      case "[object Object]":
        return _arrayReduce(function(acc, key) {
          acc[key] = fn(functor[key]);
          return acc;
        }, {}, keys_default(functor));
      default:
        return _map(fn, functor);
    }
  })
);
var map_default = map;

// node_modules/ramda/es/internal/_isInteger.js
var isInteger_default = Number.isInteger || function _isInteger(n) {
  return n << 0 === n;
};

// node_modules/ramda/es/internal/_isString.js
function _isString(x) {
  return Object.prototype.toString.call(x) === "[object String]";
}

// node_modules/ramda/es/nth.js
var nth = /* @__PURE__ */ _curry2(function nth2(offset, list) {
  var idx = offset < 0 ? list.length + offset : offset;
  return _isString(list) ? list.charAt(idx) : list[idx];
});
var nth_default = nth;

// node_modules/ramda/es/internal/_isArrayLike.js
var _isArrayLike = /* @__PURE__ */ _curry1(function isArrayLike(x) {
  if (isArray_default(x)) {
    return true;
  }
  if (!x) {
    return false;
  }
  if (typeof x !== "object") {
    return false;
  }
  if (_isString(x)) {
    return false;
  }
  if (x.length === 0) {
    return true;
  }
  if (x.length > 0) {
    return x.hasOwnProperty(0) && x.hasOwnProperty(x.length - 1);
  }
  return false;
});
var isArrayLike_default = _isArrayLike;

// node_modules/ramda/es/internal/_createReduce.js
var symIterator = typeof Symbol !== "undefined" ? Symbol.iterator : "@@iterator";
function _createReduce(arrayReduce, methodReduce, iterableReduce) {
  return function _reduce(xf, acc, list) {
    if (isArrayLike_default(list)) {
      return arrayReduce(xf, acc, list);
    }
    if (list == null) {
      return acc;
    }
    if (typeof list["fantasy-land/reduce"] === "function") {
      return methodReduce(xf, acc, list, "fantasy-land/reduce");
    }
    if (list[symIterator] != null) {
      return iterableReduce(xf, acc, list[symIterator]());
    }
    if (typeof list.next === "function") {
      return iterableReduce(xf, acc, list);
    }
    if (typeof list.reduce === "function") {
      return methodReduce(xf, acc, list, "reduce");
    }
    throw new TypeError("reduce: list must be array or iterable");
  };
}

// node_modules/ramda/es/internal/_xArrayReduce.js
function _xArrayReduce(xf, acc, list) {
  var idx = 0;
  var len = list.length;
  while (idx < len) {
    acc = xf["@@transducer/step"](acc, list[idx]);
    if (acc && acc["@@transducer/reduced"]) {
      acc = acc["@@transducer/value"];
      break;
    }
    idx += 1;
  }
  return xf["@@transducer/result"](acc);
}

// node_modules/ramda/es/bind.js
var bind = /* @__PURE__ */ _curry2(function bind2(fn, thisObj) {
  return _arity(fn.length, function() {
    return fn.apply(thisObj, arguments);
  });
});
var bind_default = bind;

// node_modules/ramda/es/internal/_xReduce.js
function _xIterableReduce(xf, acc, iter) {
  var step = iter.next();
  while (!step.done) {
    acc = xf["@@transducer/step"](acc, step.value);
    if (acc && acc["@@transducer/reduced"]) {
      acc = acc["@@transducer/value"];
      break;
    }
    step = iter.next();
  }
  return xf["@@transducer/result"](acc);
}
function _xMethodReduce(xf, acc, obj, methodName) {
  return xf["@@transducer/result"](obj[methodName](bind_default(xf["@@transducer/step"], xf), acc));
}
var _xReduce = /* @__PURE__ */ _createReduce(_xArrayReduce, _xMethodReduce, _xIterableReduce);
var xReduce_default = _xReduce;

// node_modules/ramda/es/internal/_xwrap.js
var XWrap = /* @__PURE__ */ function() {
  function XWrap2(fn) {
    this.f = fn;
  }
  XWrap2.prototype["@@transducer/init"] = function() {
    throw new Error("init not implemented on XWrap");
  };
  XWrap2.prototype["@@transducer/result"] = function(acc) {
    return acc;
  };
  XWrap2.prototype["@@transducer/step"] = function(acc, x) {
    return this.f(acc, x);
  };
  return XWrap2;
}();
function _xwrap(fn) {
  return new XWrap(fn);
}

// node_modules/ramda/es/reduce.js
var reduce = /* @__PURE__ */ _curry3(function(xf, acc, list) {
  return xReduce_default(typeof xf === "function" ? _xwrap(xf) : xf, acc, list);
});
var reduce_default = reduce;

// node_modules/ramda/es/always.js
var always = /* @__PURE__ */ _curry1(function always2(val) {
  return function() {
    return val;
  };
});
var always_default = always;

// node_modules/ramda/es/values.js
var values = /* @__PURE__ */ _curry1(function values2(obj) {
  var props = keys_default(obj);
  var len = props.length;
  var vals = [];
  var idx = 0;
  while (idx < len) {
    vals[idx] = obj[props[idx]];
    idx += 1;
  }
  return vals;
});
var values_default = values;

// node_modules/ramda/es/internal/_assoc.js
function _assoc(prop, val, obj) {
  if (isInteger_default(prop) && isArray_default(obj)) {
    var arr = [].concat(obj);
    arr[prop] = val;
    return arr;
  }
  var result = {};
  for (var p in obj) {
    result[p] = obj[p];
  }
  result[prop] = val;
  return result;
}

// node_modules/ramda/es/isNil.js
var isNil = /* @__PURE__ */ _curry1(function isNil2(x) {
  return x == null;
});
var isNil_default = isNil;

// node_modules/ramda/es/assocPath.js
var assocPath = /* @__PURE__ */ _curry3(function assocPath2(path3, val, obj) {
  if (path3.length === 0) {
    return val;
  }
  var idx = path3[0];
  if (path3.length > 1) {
    var nextObj = !isNil_default(obj) && _has(idx, obj) && typeof obj[idx] === "object" ? obj[idx] : isInteger_default(path3[1]) ? [] : {};
    val = assocPath2(Array.prototype.slice.call(path3, 1), val, nextObj);
  }
  return _assoc(idx, val, obj);
});
var assocPath_default = assocPath;

// node_modules/ramda/es/assoc.js
var assoc = /* @__PURE__ */ _curry3(function assoc2(prop, val, obj) {
  return assocPath_default([prop], val, obj);
});
var assoc_default = assoc;

// node_modules/ramda/es/internal/_cloneRegExp.js
function _cloneRegExp(pattern) {
  return new RegExp(pattern.source, pattern.flags ? pattern.flags : (pattern.global ? "g" : "") + (pattern.ignoreCase ? "i" : "") + (pattern.multiline ? "m" : "") + (pattern.sticky ? "y" : "") + (pattern.unicode ? "u" : "") + (pattern.dotAll ? "s" : ""));
}

// node_modules/ramda/es/internal/_clone.js
function _clone(value, deep, map3) {
  map3 || (map3 = new _ObjectMap());
  if (_isPrimitive(value)) {
    return value;
  }
  var copy = function copy2(copiedValue) {
    var cachedCopy = map3.get(value);
    if (cachedCopy) {
      return cachedCopy;
    }
    map3.set(value, copiedValue);
    for (var key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        copiedValue[key] = deep ? _clone(value[key], true, map3) : value[key];
      }
    }
    return copiedValue;
  };
  switch (type_default(value)) {
    case "Object":
      return copy(Object.create(Object.getPrototypeOf(value)));
    case "Array":
      return copy([]);
    case "Date":
      return new Date(value.valueOf());
    case "RegExp":
      return _cloneRegExp(value);
    case "Int8Array":
    case "Uint8Array":
    case "Uint8ClampedArray":
    case "Int16Array":
    case "Uint16Array":
    case "Int32Array":
    case "Uint32Array":
    case "Float32Array":
    case "Float64Array":
    case "BigInt64Array":
    case "BigUint64Array":
      return value.slice();
    default:
      return value;
  }
}
function _isPrimitive(param) {
  var type3 = typeof param;
  return param == null || type3 != "object" && type3 != "function";
}
var _ObjectMap = /* @__PURE__ */ function() {
  function _ObjectMap2() {
    this.map = {};
    this.length = 0;
  }
  _ObjectMap2.prototype.set = function(key, value) {
    const hashedKey = this.hash(key);
    let bucket = this.map[hashedKey];
    if (!bucket) {
      this.map[hashedKey] = bucket = [];
    }
    bucket.push([key, value]);
    this.length += 1;
  };
  _ObjectMap2.prototype.hash = function(key) {
    let hashedKey = [];
    for (var value in key) {
      hashedKey.push(Object.prototype.toString.call(key[value]));
    }
    return hashedKey.join();
  };
  _ObjectMap2.prototype.get = function(key) {
    if (this.length <= 180) {
      for (const p in this.map) {
        const bucket2 = this.map[p];
        for (let i = 0; i < bucket2.length; i += 1) {
          const element = bucket2[i];
          if (element[0] === key) {
            return element[1];
          }
        }
      }
      return;
    }
    const hashedKey = this.hash(key);
    const bucket = this.map[hashedKey];
    if (!bucket) {
      return;
    }
    for (let i = 0; i < bucket.length; i += 1) {
      const element = bucket[i];
      if (element[0] === key) {
        return element[1];
      }
    }
  };
  return _ObjectMap2;
}();

// node_modules/ramda/es/clone.js
var clone = /* @__PURE__ */ _curry1(function clone2(value) {
  return value != null && typeof value.clone === "function" ? value.clone() : _clone(value, true);
});
var clone_default = clone;

// node_modules/ramda/es/not.js
var not = /* @__PURE__ */ _curry1(function not2(a) {
  return !a;
});
var not_default = not;

// node_modules/ramda/es/internal/_pipe.js
function _pipe(f, g) {
  return function() {
    return g.call(this, f.apply(this, arguments));
  };
}

// node_modules/ramda/es/internal/_checkForMethod.js
function _checkForMethod(methodname, fn) {
  return function() {
    var length = arguments.length;
    if (length === 0) {
      return fn();
    }
    var obj = arguments[length - 1];
    return isArray_default(obj) || typeof obj[methodname] !== "function" ? fn.apply(this, arguments) : obj[methodname].apply(obj, Array.prototype.slice.call(arguments, 0, length - 1));
  };
}

// node_modules/ramda/es/slice.js
var slice = /* @__PURE__ */ _curry3(
  /* @__PURE__ */ _checkForMethod("slice", function slice2(fromIndex, toIndex, list) {
    return Array.prototype.slice.call(list, fromIndex, toIndex);
  })
);
var slice_default = slice;

// node_modules/ramda/es/tail.js
var tail = /* @__PURE__ */ _curry1(
  /* @__PURE__ */ _checkForMethod(
    "tail",
    /* @__PURE__ */ slice_default(1, Infinity)
  )
);
var tail_default = tail;

// node_modules/ramda/es/pipe.js
function pipe() {
  if (arguments.length === 0) {
    throw new Error("pipe requires at least one argument");
  }
  return _arity(arguments[0].length, reduce_default(_pipe, arguments[0], tail_default(arguments)));
}

// node_modules/ramda/es/reverse.js
var reverse = /* @__PURE__ */ _curry1(function reverse2(list) {
  return _isString(list) ? list.split("").reverse().join("") : Array.prototype.slice.call(list, 0).reverse();
});
var reverse_default = reverse;

// node_modules/ramda/es/compose.js
function compose() {
  if (arguments.length === 0) {
    throw new Error("compose requires at least one argument");
  }
  return pipe.apply(this, reverse_default(arguments));
}

// node_modules/ramda/es/head.js
var head = /* @__PURE__ */ nth_default(0);
var head_default = head;

// node_modules/ramda/es/remove.js
var remove = /* @__PURE__ */ _curry3(function remove2(start, count, list) {
  var result = Array.prototype.slice.call(list, 0);
  result.splice(start, count);
  return result;
});
var remove_default = remove;

// node_modules/ramda/es/internal/_dissoc.js
function _dissoc(prop, obj) {
  if (obj == null) {
    return obj;
  }
  if (isInteger_default(prop) && isArray_default(obj)) {
    return remove_default(prop, 1, obj);
  }
  var result = {};
  for (var p in obj) {
    result[p] = obj[p];
  }
  delete result[prop];
  return result;
}

// node_modules/ramda/es/dissocPath.js
function _shallowCloneObject(prop, obj) {
  if (isInteger_default(prop) && isArray_default(obj)) {
    return [].concat(obj);
  }
  var result = {};
  for (var p in obj) {
    result[p] = obj[p];
  }
  return result;
}
var dissocPath = /* @__PURE__ */ _curry2(function dissocPath2(path3, obj) {
  if (obj == null) {
    return obj;
  }
  switch (path3.length) {
    case 0:
      return obj;
    case 1:
      return _dissoc(path3[0], obj);
    default:
      var head2 = path3[0];
      var tail2 = Array.prototype.slice.call(path3, 1);
      if (obj[head2] == null) {
        return _shallowCloneObject(head2, obj);
      } else {
        return assoc_default(head2, dissocPath2(tail2, obj[head2]), obj);
      }
  }
});
var dissocPath_default = dissocPath;

// node_modules/ramda/es/dissoc.js
var dissoc = /* @__PURE__ */ _curry2(function dissoc2(prop, obj) {
  return dissocPath_default([prop], obj);
});
var dissoc_default = dissoc;

// node_modules/ramda/es/internal/_objectAssign.js
function _objectAssign(target) {
  if (target == null) {
    throw new TypeError("Cannot convert undefined or null to object");
  }
  var output = Object(target);
  var idx = 1;
  var length = arguments.length;
  while (idx < length) {
    var source = arguments[idx];
    if (source != null) {
      for (var nextKey in source) {
        if (_has(nextKey, source)) {
          output[nextKey] = source[nextKey];
        }
      }
    }
    idx += 1;
  }
  return output;
}
var objectAssign_default = typeof Object.assign === "function" ? Object.assign : _objectAssign;

// node_modules/ramda/es/lens.js
var lens = /* @__PURE__ */ _curry2(function lens2(getter, setter) {
  return function(toFunctorFn) {
    return function(target) {
      return map_default(function(focus) {
        return setter(focus, target);
      }, toFunctorFn(getter(target)));
    };
  };
});
var lens_default = lens;

// node_modules/ramda/es/paths.js
var paths = /* @__PURE__ */ _curry2(function paths2(pathsArray, obj) {
  return pathsArray.map(function(paths3) {
    var val = obj;
    var idx = 0;
    var p;
    while (idx < paths3.length) {
      if (val == null) {
        return;
      }
      p = paths3[idx];
      val = isInteger_default(p) ? nth_default(p, val) : val[p];
      idx += 1;
    }
    return val;
  });
});
var paths_default = paths;

// node_modules/ramda/es/path.js
var path = /* @__PURE__ */ _curry2(function path2(pathAr, obj) {
  return paths_default([pathAr], obj)[0];
});
var path_default = path;

// node_modules/ramda/es/lensPath.js
var lensPath = /* @__PURE__ */ _curry1(function lensPath2(p) {
  return lens_default(path_default(p), assocPath_default(p));
});
var lensPath_default = lensPath;

// node_modules/ramda/es/mapObjIndexed.js
var mapObjIndexed = /* @__PURE__ */ _curry2(function mapObjIndexed2(fn, obj) {
  return _arrayReduce(function(acc, key) {
    acc[key] = fn(obj[key], key, obj);
    return acc;
  }, {}, keys_default(obj));
});
var mapObjIndexed_default = mapObjIndexed;

// node_modules/ramda/es/sum.js
var sum = /* @__PURE__ */ reduce_default(add_default, 0);
var sum_default = sum;

// node_modules/ramda/es/mergeAll.js
var mergeAll = /* @__PURE__ */ _curry1(function mergeAll2(list) {
  return objectAssign_default.apply(null, [{}].concat(list));
});
var mergeAll_default = mergeAll;

// node_modules/ramda/es/over.js
var Identity = function(x) {
  return {
    value: x,
    map: function(f) {
      return Identity(f(x));
    }
  };
};
var over = /* @__PURE__ */ _curry3(function over2(lens3, f, x) {
  return lens3(function(y) {
    return Identity(f(y));
  })(x).value;
});
var over_default = over;

// node_modules/ramda/es/set.js
var set = /* @__PURE__ */ _curry3(function set2(lens3, v, x) {
  return over_default(lens3, always_default(v), x);
});
var set_default = set;

// node_modules/ramda/es/toPairs.js
var toPairs = /* @__PURE__ */ _curry1(function toPairs2(obj) {
  var pairs = [];
  for (var prop in obj) {
    if (_has(prop, obj)) {
      pairs[pairs.length] = [prop, obj[prop]];
    }
  }
  return pairs;
});
var toPairs_default = toPairs;

// node_modules/ramda/es/trim.js
var hasProtoTrim = typeof String.prototype.trim === "function";

// src/lib/allocate.js
function allocate(balances, reward2) {
  var total = reduce_default(
    add_default,
    0,
    values_default(balances).filter((v) => v > 0)
  );
  const allocation = mergeAll_default(
    reduce_default(
      (a, s) => {
        const asset = s[0];
        const balance2 = s[1];
        if (balance2 < 1) {
          return a;
        }
        var pct = balance2 / total * 100;
        const coins = Math.round(reward2 * (pct / 100));
        return [...a, { [asset]: Number(coins) }];
      },
      [],
      Object.entries(balances)
    )
  );
  var remainder = reward2 - sum_default(values_default(allocation));
  var iterator = keys_default(allocation).entries();
  while (remainder > 0) {
    allocation[iterator.next().value[1]]++;
    remainder--;
  }
  return allocation;
}

// src/cron/reward.js
var DAY = 720;
var TOTAL_SUPPLY = 2628e4 * 1e6;
var HALVING_SUPPLY = TOTAL_SUPPLY * 0.9;
var ORIGIN_HEIGHT = 1232615;
var CYCLE_INTERVAL = DAY * 365;
function reward(state) {
  if (state.lastReward + DAY >= SmartWeave.block.height) {
    return state;
  }
  if (keys_default(state.streaks).length < 1) {
    return state;
  }
  const { reward: reward2 } = setReward(SmartWeave.block.height)({ state });
  if (reward2 === 0) {
    return state;
  }
  state.streaks = keys_default(state.streaks).reduce((a, k) => {
    if (state.streaks[k].lastHeight > SmartWeave.block.height - DAY * 2) {
      return { ...a, [k]: state.streaks[k] };
    }
    return a;
  }, {});
  if (keys_default(state.streaks).length === 0) {
    return state;
  }
  const streaks = assignPoints(state.streaks);
  state.recentRewards = allocate(streaks, reward2);
  state = updateBalances({ state, rewards: state.recentRewards });
  state.lastReward = SmartWeave.block.height;
  return state;
}
function assignPoints(streaks) {
  return keys_default(streaks).reduce((a, k) => {
    if (streaks[k].days > 0) {
      const multiplier = streaks[k].days - 1;
      return assoc_default(k, 1 + multiplier * 0.1, a);
    } else {
      return a;
    }
  }, {});
}
function setReward(height) {
  return ({ state }) => {
    const S100 = 1 * 1e6;
    const current = sum_default(values_default(state.balances)) || 0;
    if (current >= HALVING_SUPPLY) {
      if (!state.balances[contractId]) {
        state.balances[contractId] = 0;
      }
      return 0;
    }
    const reward2 = getReward(
      HALVING_SUPPLY,
      CYCLE_INTERVAL,
      height,
      ORIGIN_HEIGHT
    );
    return { state, reward: reward2 };
  };
}
function updateBalances({ state, rewards }) {
  keys_default(rewards).forEach((k) => {
    if (!state.balances[k]) {
      state.balances[k] = 0;
    }
    state.balances[k] += rewards[k];
  });
  return state;
}
function getReward(supply, interval, currentHeight, originHeight) {
  const blockHeight = currentHeight - originHeight;
  const currentCycle = Math.floor(blockHeight / interval) + 1;
  const divisor = Math.pow(2, currentCycle);
  const reward2 = Math.floor(Math.floor(supply / divisor) / 365);
  return reward2;
}

// src/write/cancel-claim.js
var cancelClaim = async (state, action) => {
  ContractAssert(action.input.contract, "contract is required");
  ContractAssert(action.input.transaction, "transaction is required");
  ContractAssert(action.input.qty, "transaction is required");
  ContractAssert(action.input.contract.length === 43, "contract is not valid");
  ContractAssert(action.input.transaction.length === 43, "transaction is not valid");
  ContractAssert(Number.isInteger(action.input.qty), "qty must be integer");
  await SmartWeave.contracts.write(action.input.contract, {
    function: "reject",
    tx: action.input.transaction,
    qty: action.input.qty
  });
  return { state };
};

// src/write/contributor-mint.js
var TOTAL_SUPPLY2 = 2628e4 * 1e6;
var REWARD_SUPPY = TOTAL_SUPPLY2 * 0.1;
var REWARD_VESTING_PERIOD = 720 * 365 * 4;
var REWARD_UNIT_PER_HEIGHT = Math.floor(REWARD_SUPPY / REWARD_VESTING_PERIOD);
function contributorMint(state, action) {
  const currentHeight = SmartWeave.block.height;
  const originHeight = state.originHeight;
  return of({
    state,
    contributor: action.caller,
    height: {
      origin: originHeight,
      current: currentHeight
    }
  }).chain(getContributor).map(calcBlockDiff).map(calcRewardAmount).map(allocateForTier).map(allocateForMember).map(updateBalances2).map(setLastMint4Member);
}
function setLastMint4Member(ctx) {
  const lastMintPath = ["contributors", "tiers", ctx.contributor.tier.name, "members", ctx.contributor.addr, "lastMint"];
  ctx.state = set_default(lensPath_default(lastMintPath), ctx.height.current, ctx.state);
  return { state: ctx.state };
}
function updateBalances2(ctx) {
  const { state } = ctx;
  if (!state.balances[ctx.contributor.addr]) {
    state.balances[ctx.contributor.addr] = 0;
  }
  state.balances[ctx.contributor.addr] += ctx.rewardMember;
  return assoc_default("state", state, ctx);
}
function allocateForMember(ctx) {
  const members = ctx.state.contributors.tiers[ctx.contributor.tier.name].members;
  const table = reduce_default((acc, [key, value]) => assoc_default(key, value.amount, acc), {}, toPairs_default(members));
  const reward2 = allocate(table, ctx.rewardTier);
  return assoc_default("rewardMember", reward2[ctx.contributor.addr], ctx);
}
function allocateForTier(ctx) {
  const { contributor, reward: reward2 } = ctx;
  const rewardTier = Math.floor(reward2 * (contributor.tier.percent / 100));
  return assoc_default("rewardTier", rewardTier, ctx);
}
function calcRewardAmount(ctx) {
  const { height } = ctx;
  const reward2 = height.diff * REWARD_UNIT_PER_HEIGHT;
  return assoc_default("reward", reward2, ctx);
}
function calcBlockDiff(ctx) {
  const height = ctx.height;
  const contributor = ctx.contributor;
  const start = contributor.lastMint === 0 ? height.origin : contributor.lastMint;
  const diff = height.current - start;
  return assoc_default("height", { ...height, diff }, ctx);
}
function getContributor({ state, contributor, height }) {
  return compose(
    (c) => c ? Right({ state, contributor: c, height }) : Left("could not find"),
    head_default,
    map_default((m) => m[contributor]),
    (tiers) => {
      const members = reduce_default((a, [tierName, tierValue]) => {
        const o = mapObjIndexed_default((d, k) => {
          return { ...d, tier: { name: tierName, percent: tierValue.percent }, addr: k };
        }, tierValue.members);
        return a.concat(o);
      }, [], toPairs_default(tiers));
      return members;
    },
    path_default(["contributors", "tiers"])
  )(state);
}

// src/write/contributor-chg.js
function contributorChg(state, action) {
  return of({ state, action }).chain(validate6).map(cloneMembers).map(setTarget).map(dissocCaller).map(attachMembers);
}
function attachMembers(ctx) {
  ctx.state.contributors.tiers[ctx.tier].members = ctx.members;
  return { state: ctx.state };
}
function dissocCaller(ctx) {
  ctx.members = dissoc_default(ctx.caller, ctx.members);
  return ctx;
}
function setTarget(ctx) {
  ctx.members = assoc_default(ctx.target, ctx.members[ctx.caller], ctx.members);
  return ctx;
}
function cloneMembers(ctx) {
  return { ...ctx, members: clone_default(path_default(["contributors", "tiers", ctx.tier, "members"], ctx.state)) };
}
function validate6({ state, action }) {
  if (not_default(action.input.tier)) {
    return Left("Tier Input is required");
  }
  if (not_default(action.input.target)) {
    return Left("Target Input is required");
  }
  return Right({
    state,
    caller: action.caller,
    tier: action.input.tier,
    target: action.input.target
  });
}

// src/write/evolve.js
var EVOLVE_WINDOW = 720 * 180;
function evolve(state, action) {
  if (state.canEvolve && SmartWeave.block.height < state.originHeight + EVOLVE_WINDOW) {
    if (SmartWeave.contract.owner === action.caller) {
      state.evolve = action.input.value;
    }
  }
  return { state };
}

// src/index.js
var identity = (x) => x;
export async function handle(state, action) {
  async function CreateOrderPlusBuyback(state2, action2) {
    const result = await CreateOrder(state2, action2);
    return result;
  }
  validate3(state);
  if (action.input.function === "createOrder") {
    state = reward(state);
  }
  if (action.input.function === "createOrder" && !action.input.price) {
    state = await buyback(state);
  }
  switch (action?.input?.function) {
    case "noop":
      return { state };
    case "addPair":
      return addPair(state, action).extract();
    case "createOrder":
      return CreateOrderPlusBuyback(state, action);
    case "cancelOrder":
      return CancelOrder(state, action);
    case "cancelClaim":
      return cancelClaim(state, action);
    case "balance":
      return balance(state, action);
    case "transfer":
      return transfer(state, action).fold(handleError, identity);
    case "allow":
      return allow(state, action).fold(handleError, identity);
    case "claim":
      return claim(state, action).fold(handleError, identity);
    case "contributorMint":
      return contributorMint(state, action).fold(handleError, identity);
    case "contributorChg":
      return contributorChg(state, action).fold(handleError, identity);
    case "evolve":
      return evolve(state, action);
    default:
      throw new ContractError("No Function Found");
  }
}
function handleError(msg) {
  throw new ContractError(msg);
}
