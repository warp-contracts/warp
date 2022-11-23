(() => {
  // src/thetAR/actions/common.ts
  var isAddress = (addr) => /[a-z0-9_-]{43}/i.test(addr);
  var hashCheck = async (validHashs, contractTxId) => {
    const tx = await SmartWeave.unsafeClient.transactions.get(contractTxId);
    let SrcTxId;
    tx.get("tags").forEach((tag) => {
      let key = tag.get("name", { decode: true, string: true });
      if (key === "Contract-Src") {
        SrcTxId = tag.get("value", { decode: true, string: true });
      }
    });
    if (!SrcTxId || !isAddress(SrcTxId)) {
      throw new ContractError("Cannot find valid srcTxId in contract Tx content!");
    }
    const srcTx = await SmartWeave.unsafeClient.transactions.getData(SrcTxId, { decode: true, string: true });
    if (srcTx.length < 1e4 && validHashs.includes(calcHash(srcTx))) {
      return true;
    }
    return false;
  };
  var calcHash = (string) => {
    var hash = 0, i, chr;
    if (string.length === 0)
      return hash;
    for (i = 0; i < string.length; i++) {
      chr = string.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0;
    }
    return hash;
  };
  var selectWeightedTokenHolder = async (balances) => {
    let totalTokens = 0;
    for (const address of Object.keys(balances)) {
      totalTokens += balances[address];
    }
    let sum = 0;
    const r = await getRandomIntNumber(totalTokens);
    for (const address of Object.keys(balances)) {
      sum += balances[address];
      if (r <= sum && balances[address] > 0) {
        return address;
      }
    }
    return void 0;
  };
  async function getRandomIntNumber(max, uniqueValue = "") {
    const pseudoRandomData = SmartWeave.arweave.utils.stringToBuffer(SmartWeave.block.height + SmartWeave.block.timestamp + SmartWeave.transaction.id + uniqueValue);
    const hashBytes = await SmartWeave.arweave.crypto.hash(pseudoRandomData);
    const randomBigInt = bigIntFromBytes(hashBytes);
    return Number(randomBigInt % BigInt(max));
  }
  function bigIntFromBytes(byteArr) {
    let hexString = "";
    for (const byte of byteArr) {
      hexString += byte.toString(16).padStart(2, "0");
    }
    return BigInt("0x" + hexString);
  }

  // src/thetAR/actions/write/addPair.ts
  var addPair = async (state, action) => {
    const param = action.input.params;
    const tokenAddress = param.tokenAddress;
    const logoTx = param.logo;
    const description = param.description;
    if (!isAddress(tokenAddress)) {
      throw new ContractError("Token address format error!");
    }
    if (!isAddress(logoTx)) {
      throw new ContractError("You should enter transaction id for Arweave of your logo!");
    }
    if (!validDescription(description)) {
      throw new ContractError("Description you enter is not valid!");
    }
    if (action.caller !== state.owner) {
      const txQty = SmartWeave.transaction.quantity;
      const txTarget = SmartWeave.transaction.target;
      if (txTarget !== state.owner) {
        throw new ContractError("AddPair fee sent to wrong target!");
      }
      if (SmartWeave.arweave.ar.isLessThan(txQty, SmartWeave.arweave.ar.arToWinston("10"))) {
        throw new ContractError("AddPair fee not right!");
      }
      if (!await hashCheck(state.tokenSrcTemplateHashs, tokenAddress)) {
        throw new ContractError("Pst contract validation check failed!");
      }
    }
    if (state.pairInfos.map((info) => info.tokenAddress).includes(tokenAddress)) {
      throw new ContractError("Pair already exists!");
    }
    const tokenState = await SmartWeave.contracts.readContractState(tokenAddress);
    state.maxPairId++;
    state.pairInfos.push({
      pairId: state.maxPairId,
      tokenAddress,
      logo: logoTx,
      description,
      name: tokenState.name,
      symbol: tokenState.symbol,
      decimals: tokenState.decimals
    });
    state.orderInfos[state.maxPairId] = {
      currentPrice: void 0,
      orders: []
    };
    for (const user in state.userOrders) {
      if (Object.prototype.hasOwnProperty.call(state.userOrders, user)) {
        let userOrder2 = state.userOrders[user];
        userOrder2[state.maxPairId] = [];
      }
    }
    return { state };
  };
  var validDescription = (desc) => /[a-z0-9_\s\:\/-]{1,128}/i.test(desc);

  // src/thetAR/actions/write/createOrder.ts
  var createOrder = async (state, action) => {
    const param = action.input.params;
    if (!(param.pairId <= state.maxPairId && param.pairId >= 0)) {
      throw new ContractError("PairId not valid!");
    }
    if (param.price !== void 0 && param.price !== null) {
      if (typeof param.price !== "number") {
        throw new ContractError("Price must be a number!");
      }
      if (param.price <= 0 || !Number.isInteger(param.price)) {
        throw new ContractError("Price must be positive integer!");
      }
    }
    const newOrder = {
      creator: action.caller,
      orderId: SmartWeave.transaction.id,
      direction: param.direction,
      quantity: await checkOrderQuantity(state, action),
      price: param.price
    };
    let selectedFeeRecvr = void 0;
    try {
      selectedFeeRecvr = await selectWeightedTokenHolder(await tokenBalances(state.thetarTokenAddress));
    } catch {
    }
    const { newOrderbook, newUserOrders, transactions, currentPrice } = await matchOrder(newOrder, state.orderInfos[param.pairId].orders, state.userOrders, param.pairId, action.caller, state.feeRatio, selectedFeeRecvr);
    state.orderInfos[param.pairId].orders = newOrderbook;
    state.userOrders = newUserOrders;
    if (!isNaN(currentPrice) && isFinite(currentPrice)) {
      state.orderInfos[param.pairId].currentPrice = currentPrice;
    }
    for await (const tx of transactions) {
      const matchedPair = state.pairInfos.find((i) => i.pairId === param.pairId);
      const targetTokenAdrress = tx.tokenType === "dominent" ? state.thetarTokenAddress : matchedPair.tokenAddress;
      await SmartWeave.contracts.write(targetTokenAdrress, { function: "transfer", to: tx.to, amount: tx.quantity });
    }
    return { state };
  };
  var tokenBalances = async (tokenAddress) => {
    return (await SmartWeave.contracts.readContractState(tokenAddress)).balances;
  };
  var checkOrderQuantity = async (state, action) => {
    const param = action.input.params;
    let pairInfo2 = state.pairInfos.find((pair) => pair.pairId === param.pairId);
    const tokenAddress = param.direction === "buy" ? state.thetarTokenAddress : pairInfo2.tokenAddress;
    const tokenState = await SmartWeave.contracts.readContractState(tokenAddress);
    let orderQuantity = tokenState.allowances[action.caller][SmartWeave.contract.id];
    //await SmartWeave.contracts.write(tokenAddress, { function: "transferFrom", from: action.caller, to: SmartWeave.contract.id, amount: orderQuantity });
    //JS version
    logger.error("CREATE Taking tokens: " + orderQuantity);
    await SmartWeave.contracts.write(tokenAddress, { function: "transferFrom", sender: action.caller, recipient: SmartWeave.contract.id, amount: orderQuantity });
    if (param.direction === "buy" && param.price) {
      orderQuantity = Math.floor(orderQuantity / param.price);
    }
    return orderQuantity;
  };
  var matchOrder = async (newOrder, orderbook, userOrders, newOrderPairId, caller, feeRatio, selectedFeeRecvr) => {
    let transactions = Array();
    const targetSortDirection = newOrder.direction === "buy" ? "sell" : "buy";
    let totalTradePrice = 0;
    let totalTradeVolume = 0;
    const reverseOrderbook = orderbook.filter((order) => order.direction === targetSortDirection).sort((a, b) => {
      if (newOrder.direction === "buy") {
        return a.price > b.price ? 1 : -1;
      } else {
        return a.price > b.price ? -1 : 1;
      }
    });
    const orderType = newOrder.price ? "limit" : "market";
    if (reverseOrderbook.length === 0 && orderType === "market") {
      throw new ContractError(`The first order must be limit type!`);
    }
    const newOrderTokenType = orderType === "market" && newOrder.direction === "buy" ? "dominent" : "trade";
    for (let i = 0; i < reverseOrderbook.length; i++) {
      const order = reverseOrderbook[i];
      if (orderType === "limit" && order.price !== newOrder.price) {
        continue;
      }
      const targetPrice = order.price;
      const orderAmount = order.quantity;
      const newOrderAmoumt = newOrderTokenType === "trade" ? newOrder.quantity : Math.floor(newOrder.quantity / targetPrice);
      const targetAmout = orderAmount < newOrderAmoumt ? orderAmount : newOrderAmoumt;
      totalTradePrice += targetPrice * targetAmout;
      totalTradeVolume += targetAmout;
      if (targetAmout === 0) {
        break;
      }
      const dominentFee = Math.floor(targetAmout * targetPrice * feeRatio);
      const tradeFee = Math.floor(targetAmout * feeRatio);
      const dominentSwap = targetAmout * targetPrice - dominentFee;
      const tradeSwap = targetAmout - tradeFee;
      const buyer = newOrder.direction === "buy" ? newOrder : order;
      const seller = newOrder.direction === "buy" ? order : newOrder;
      transactions.push({
        tokenType: "dominent",
        to: seller.creator,
        quantity: dominentSwap
      });
      transactions.push({
        tokenType: "trade",
        to: buyer.creator,
        quantity: tradeSwap
      });
      if (selectedFeeRecvr) {
        transactions.push({
          tokenType: "dominent",
          to: selectedFeeRecvr,
          quantity: dominentFee
        });
        transactions.push({
          tokenType: "trade",
          to: selectedFeeRecvr,
          quantity: tradeFee
        });
      }
      order.quantity -= targetAmout;
      if (order.quantity === 0) {
        orderbook = orderbook.filter((v) => v.orderId !== order.orderId);
      }
      let userOrderInfos = userOrders[order.creator][newOrderPairId];
      let matchedOrderIdx = userOrderInfos.findIndex((value) => value.orderId === order.orderId);
      userOrderInfos[matchedOrderIdx].quantity -= targetAmout;
      if (userOrderInfos[matchedOrderIdx].quantity === 0) {
        userOrders[order.creator][newOrderPairId] = userOrderInfos.filter((v) => v.orderId !== order.orderId);
      }
      newOrder.quantity -= newOrderTokenType === "trade" ? targetAmout : targetAmout * targetPrice;
    }
    if (orderType === "market" && newOrder.quantity !== 0) {
      transactions.push({
        tokenType: newOrderTokenType,
        to: newOrder.creator,
        quantity: newOrder.quantity
      });
      newOrder.quantity = 0;
    }
    if (orderType === "limit" && newOrder.quantity !== 0) {
      orderbook.push({ ...newOrder });
    }
    if (newOrder.quantity !== 0) {
      if (userOrders[caller] === void 0) {
        userOrders[caller] = {};
      }
      if (userOrders[caller][newOrderPairId] === void 0) {
        userOrders[caller][newOrderPairId] = [];
      }
      userOrders[caller][newOrderPairId].push({ ...newOrder });
    }
    return {
      newOrderbook: orderbook,
      newUserOrders: userOrders,
      transactions,
      currentPrice: totalTradePrice / totalTradeVolume
    };
  };

  // src/thetAR/actions/write/deposit.ts
  var deposit = async (state, action) => {
    logger.error("Token: " + action.input.params.token);
    logger.error("Amount: " + action.input.params.amount);
    await SmartWeave.contracts.write(action.input.params.token, {
      function: "transferFrom",
      from: action.caller,
      to: SmartWeave.contract.id,
      amount: action.input.params.amount
    });
    return { state };
  };

  // src/thetAR/actions/write/cancelOrder.ts
  var cancelOrder = async (state, action) => {
    const param = action.input.params;
    const orderId = param.orderId;
    const pairId = param.pairId;
    if (!isAddress(orderId)) {
      throw new ContractError(`OrderId not found: ${param.orderId}!`);
    }
    if (!(param.pairId <= state.maxPairId && param.pairId >= 0)) {
      throw new ContractError("PairId not valid!");
    }
    const orderInfo2 = state.userOrders[action.caller][pairId].find((v) => v.orderId === orderId);
    const pairInfo2 = state.pairInfos.find((i) => i.pairId === pairId);
    if (!orderInfo2) {
      throw new ContractError(`Cannot get access to pairId: ${pairId}!`);
    }
    if (!pairInfo2) {
      throw new ContractError(`Pair info record not found: ${pairId}!`);
    }
    const tokenAddress = orderInfo2.direction === "buy" ? state.thetarTokenAddress : pairInfo2.tokenAddress;
    const quantity = orderInfo2.direction === "buy" ? orderInfo2.price * orderInfo2.quantity : orderInfo2.quantity;
    logger.error("CANCEL Returning tokens: " + quantity);
    await SmartWeave.contracts.write(tokenAddress, { function: "transfer", to: action.caller, amount: quantity });
    let ordersForUser = state.userOrders[action.caller][pairId];
    state.userOrders[action.caller][pairId] = ordersForUser.filter((i) => i.orderId !== orderId);
    let ordersForPair = state.orderInfos[pairId].orders;
    state.orderInfos[pairId].orders = ordersForPair.filter((i) => i.orderId !== orderId);
    return { state };
  };

  // src/thetAR/actions/write/addTokenHash.ts
  var addTokenHash = async (state, action) => {
    const param = action.input.params;
    const hash = param.hash;
    if (action.caller !== state.owner) {
      throw new ContractError("You have no permission to modify hash list!");
    }
    state.tokenSrcTemplateHashs.push(hash);
    return { state };
  };

  // src/thetAR/actions/read/pairInfo.ts
  var pairInfo = async (state, action) => {
    const param = action.input.params;
    let pairId = param.pairId;
    let result;
    if (!Number.isInteger(pairId) || pairId < 0 || pairId > state.maxPairId) {
      throw new ContractError(`Invalid pairId!`);
    }
    result = state.pairInfos.filter((i) => i.pairId === pairId)[0];
    return { result };
  };

  // src/thetAR/actions/read/pairInfos.ts
  var pairInfos = async (state, action) => {
    let result;
    result = state.pairInfos;
    return { result };
  };

  // src/thetAR/actions/read/orderInfos.ts
  var orderInfos = async (state, action) => {
    let result;
    result = state.orderInfos;
    return { result };
  };

  // src/thetAR/actions/read/orderInfo.ts
  var orderInfo = async (state, action) => {
    const param = action.input.params;
    let pairId = param.pairId;
    let result;
    if (!Number.isInteger(pairId) || pairId < 0 || pairId > state.maxPairId) {
      throw new ContractError(`Invalid pairId!`);
    }
    result = state.orderInfos[pairId];
    return { result };
  };

  // src/thetAR/actions/read/userOrder.ts
  var userOrder = async (state, action) => {
    const param = action.input.params;
    let address = param.address;
    let result;
    if (!isAddress(address)) {
      throw new ContractError(`Invalid wallet address!`);
    }
    result = state.userOrders[address];
    return { result };
  };

  // src/thetAR/contract.ts
  async function handle(state, action) {
    const func = action.input.function;
    switch (func) {
      case "addPair":
        return await addPair(state, action);
      case "createOrder":
        return await createOrder(state, action);
      case "cancelOrder":
        return await cancelOrder(state, action);
      case "pairInfo":
        return await pairInfo(state, action);
      case "pairInfos":
        return await pairInfos(state, action);
      case "orderInfo":
        return await orderInfo(state, action);
      case "orderInfos":
        return await orderInfos(state, action);
      case "addTokenHash":
        return await addTokenHash(state, action);
      case "userOrder":
        return await userOrder(state, action);
      case "deposit":
        return await deposit(state, action);
      default:
        throw new ContractError(`No function supplied or function not recognised: "${func}"`);
    }
  }
})();
