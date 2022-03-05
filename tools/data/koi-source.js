'use strict';
async function batchAction(state, action) {
  const votes = state.votes;
  const validBundlers = state.validBundlers;
  const caller = action.caller;
  const input = action.input;
  const batchTxId = input.batchFile;
  const voteId = input.voteId;
  const vote = votes[voteId];
  // if (SmartWeave.block.height > vote.end)
  //   throw new ContractError('it is closed');
  if (!batchTxId) throw new ContractError("No txId specified");
  if (!Number.isInteger(voteId)) {
    throw new ContractError(
      'Invalid value for "voting id". Must be an integer'
    );
  }
  if (!(typeof batchTxId === "string"))
    throw new ContractError("batchTxId should be string");
  if (!validBundlers.includes(action.caller))
    throw new ContractError("Only selected bundlers can write batch actions.");
  const MAIN_CONTRACT = "Qa9SzAuwJR6xZp3UiKzokKEoRnt_utJKjFjTaSR85Xw";
  const tokenContractState = await SmartWeave.contracts.readContractState(
    MAIN_CONTRACT
  );
  const stakes = tokenContractState.stakes;
  if (!(caller in stakes)) {
    throw new ContractError("caller hasn't staked");
  }
  const batch = await SmartWeave.unsafeClient.transactions.getData(batchTxId, {
    decode: true,
    string: true
  });
  const batchInArray = batch.split();
  const voteArray = JSON.parse(batchInArray);
  for (let voteObj of voteArray) {
    const dataInString = JSON.stringify(voteObj.vote);
    const voteBuffer = await SmartWeave.arweave.utils.stringToBuffer(
      dataInString
    );
    const rawSignature = await SmartWeave.arweave.utils.b64UrlToBuffer(
      voteObj.signature
    );
    const isVoteValid = await SmartWeave.arweave.crypto.verify(
      voteObj.owner,
      voteBuffer,
      rawSignature
    );
    if (
      isVoteValid &&
      voteObj.vote.voteId === voteId &&
      !vote.voted.includes(voteObj.senderAddress)
    ) {
      if (voteObj.vote.userVote === "true") {
        vote["yays"] += 1;
        vote.voted.push(voteObj.senderAddress);
      }
      if (voteObj.vote.userVote === "false") {
        vote["nays"] += 1;
        vote.voted.push(voteObj.senderAddress);
      }
    }
  }
  if (!(caller in vote.bundlers)) vote.bundlers[caller] = [];
  vote.bundlers[caller].push(batchTxId);
  return { state };
}
function deregisterData(state, action) {
  const registeredRecords = state.registeredRecord;
  const caller = action.caller;
  const input = action.input;
  const txId = input.txId;
  // check is txId is valid
  if (!txId) throw new ContractError("No txid specified");
  if (!(txId in registeredRecords))
    throw new ContractError("Transaction/content is not registered");
  if (caller !== state.owner)
    throw new ContractError("You can not Delete a Content");
  delete registeredRecords[txId];
  return { state };
}
async function distribution(state, action) {
  const task = state.task;
  const registerRecords = state.registeredRecords;
  const caller = action.caller;
  // if (SmartWeave.block.height < trafficLogs.close) {
  //   throw new ContractError("voting process is ongoing");
  // }
  const currentTask = task.dailyPayload.find(
    (payLoad) => payLoad.block === task.open
  );
  if (currentTask.isDistributed)
    throw new ContractError("Reward is distributed");
  const logSummary = {};
  let totalDataRe = 0;
  const payloads = currentTask.payloads;
  for (var i = 0; i < payloads.length; i++) {
    if (payloads[i].won) {
      const batch = await SmartWeave.unsafeClient.transactions.getData(
        payloads[i].TLTxId,
        { decode: true, string: true }
      );
      const logs = JSON.parse(batch);
      logs.forEach((element) => {
        const contentId = element.url.substring(1);
        if (contentId in registerRecords) {
          totalDataRe += element.addresses.length;
          logSummary[contentId] = element.addresses.length;
        }
      });
    }
  }
  let rewardPerAttention = 0;
  if (totalDataRe !== 0) {
    rewardPerAttention = 1000 / totalDataRe;
  }
  const distribution = {};
  for (const log in logSummary)
    distribution[registerRecords[log]] = logSummary[log] * rewardPerAttention;
  const distributionReport = {
    dailyTrafficBlock: task.open,
    logsSummary: logSummary,
    distribution: distribution,
    distributer: caller,
    distributed: false,
    distributionBlock: SmartWeave.block.height,
    rewardPerAttention: rewardPerAttention
  };
  task.rewardReport.push(distributionReport);
  currentTask.isDistributed = true;
  task.open = SmartWeave.block.height;
  task.close = SmartWeave.block.height + 720;
  const newDailyTL = {
    block: task.open,
    payloads: [],
    isRanked: false,
    isDistributed: false
  };
  task.dailyPayload.push(newDailyTL);
  return { state };
}
function gateway(state, action) {
  const gateways = state.gateways;
  const balances = state.balances;
  const caller = action.caller;
  const input = action.input;
  const url = input.url;
  const publicKey = input.publicKey;
  if (!url) throw new ContractError("No gateway specified");
  if (!publicKey) throw new ContractError("No publicKey specified");
  if (balances[caller] < 1)
    throw new ContractError("you need min 1 KOI to register gateway");
  if (
    !url.match(
      /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/gi
    )
  ) {
    throw new ContractError("The gateway must be a valid URL or IP");
  }
  --balances[caller]; // burn 1 koi per registration
  gateways[caller] = {
    url: url,
    publicKey: publicKey,
    rate: 0
  };
  return { state };
}
async function proposeSlash(state, action) {
  const votes = state.votes;
  const validBundlers = state.validBundlers;
  const blackList = state.blackList;
  const receiptTxId = action.input.receiptTxId;
  // if (
  //   SmartWeave.block.height > trafficLogs.close - 75 ||
  //   SmartWeave.block.height < trafficLogs.close - 150
  // ) {
  //   throw new ContractError("Slash time not reached or passed");
  // }
  if (!receiptTxId) throw new ContractError("No receipt specified");
  const receiptData = await SmartWeave.unsafeClient.transactions.getData(
    receiptTxId,
    {
      decode: true,
      string: true
    }
  );
  const receipt = JSON.parse(receiptData);
  const payload = receipt.vote;
  const vote = payload.vote;
  const voterAddress = await SmartWeave.unsafeClient.wallets.ownerToAddress(
    payload.owner
  );
  const suspectedVote = votes[vote.voteId].voted;
  if (suspectedVote.includes(voterAddress))
    throw new ContractError("vote is found");
  const voteString = JSON.stringify(vote);
  const voteBuffer = await SmartWeave.arweave.utils.stringToBuffer(voteString);
  const rawSignature = await SmartWeave.arweave.utils.b64UrlToBuffer(
    payload.signature
  );
  const isVoteValid = await SmartWeave.arweave.crypto.verify(
    payload.owner,
    voteBuffer,
    rawSignature
  );
  if (!isVoteValid) throw new ContractError("vote is not valid");
  const receiptString = JSON.stringify(payload);
  const receiptBuffer = await SmartWeave.arweave.utils.stringToBuffer(
    receiptString
  );
  const rawReceiptSignature = await SmartWeave.arweave.utils.b64UrlToBuffer(
    receipt.signature
  );
  const isReceiptValid = await SmartWeave.arweave.crypto.verify(
    receipt.owner,
    receiptBuffer,
    rawReceiptSignature
  );
  if (!isReceiptValid) throw new ContractError("receipt is not valid");
  const bundlerAddress = await SmartWeave.unsafeClient.wallets.ownerToAddress(
    receipt.owner
  );
  const index = validBundlers.indexOf(bundlerAddress);
  if (index > -1) {
    validBundlers.splice(index, 1);
  }
  blackList.push(bundlerAddress);
  if (vote.userVote === "true") {
    votes[vote.voteId].yays += 1;
  }
  if (vote.userVote === "false") {
    votes[vote.voteId].nays += 1;
  }
  suspectedVote.push(voterAddress);
  return { state };
}
function rankProposal(state, action) {
  const task = state.task;
  const votes = state.votes;
  // if (
  //   SmartWeave.block.height > task.close ||
  //   SmartWeave.block.height < task.close - 75
  // ) {
  //   throw new ContractError("Ranking time finished or not Ranking time");
  // }
  const currentTask = task.dailyPayload.find(
    (dailyPayload) => dailyPayload.block === task.open
  );
  if (currentTask.isRanked) {
    throw new ContractError("it has already been ranked");
  }
  const payloads = currentTask.payloads;
  const proposedGateWays = {};
  payloads.forEach((prp) => {
    const prpVote = votes[prp.voteId];
    if (!proposedGateWays[prp.gateWayId]) {
      if (prpVote.yays > prpVote.nays) {
        proposedGateWays[prp.gateWayId] = prp;
        prp.won = true;
        prpVote.status = "passed";
      }
    } else {
      const currentSelectedPrp = proposedGateWays[prp.gateWayId];
      const selectedPrpVote = votes[currentSelectedPrp.voteId];
      const selectedPrpVoteTotal = selectedPrpVote.yays + selectedPrpVote.nays;
      const prpVoteTotal = prpVote.yays + prpVote.nays;
      if (prpVoteTotal > selectedPrpVoteTotal && prpVote.yays > prpVote.nays) {
        proposedGateWays[prp.gateWayId] = prp;
        prp.won = true;
        currentSelectedPrp.won = false;
        prpVote.status = "passed";
        votes[currentSelectedPrp.voteId].status = "passed";
      }
      const prpVotePassPer = prpVote.yays - prpVote.nays;
      const selPrpVotePassPer = selectedPrpVote.yays - selectedPrpVote.nays;
      if (
        prpVoteTotal === selectedPrpVoteTotal &&
        prpVotePassPer > selPrpVotePassPer
      ) {
        proposedGateWays[prp.gateWayId] = prp;
        prp.won = true;
        currentSelectedPrp.won = false;
        votes[currentSelectedPrp.voteId].status = "passed";
        prpVote.status = "passed";
      }
      if (
        prpVoteTotal === selectedPrpVoteTotal &&
        prpVotePassPer === selPrpVotePassPer &&
        prp.blockHeight < currentSelectedPrp.blockHeight
      ) {
        proposedGateWays[prp.gateWayId] = prp;
        prp.won = true;
        currentSelectedPrp.won = false;
        prpVote.status = "passed";
        votes[currentSelectedPrp.voteId].status = "passed";
      } else {
        prpVote.status = "passed";
      }
    }
  });
  currentTask.isRanked = true;
  return { state };
}
async function registerBundler(state, action) {
  const validBundlers = state.validBundlers;
  const blackList = state.blackList;
  const caller = action.caller;
  if (validBundlers.includes(caller))
    throw new ContractError(`${caller} is already registered`);
  if (blackList.includes(caller)) {
    throw new ContractError(`${caller}address is in blacklist`);
  }
  const MAIN_CONTRACT = "Qa9SzAuwJR6xZp3UiKzokKEoRnt_utJKjFjTaSR85Xw";
  const tokenContractState = await SmartWeave.contracts.readContractState(
    MAIN_CONTRACT
  );
  const stakes = tokenContractState.stakes;
  if (!(caller in stakes) || stakes[caller] < 1000) {
    throw new Contract(
      "You should stake minimum 1000 stake to register as valid bundler"
    );
  }
  validBundlers.push(caller);
  return { state };
}
async function submitPayload(state, action) {
  const task = state.task;
  const caller = action.caller;
  const input = action.input;
  const batchTxId = input.batchTxId;
  const gateWayUrl = input.gateWayUrl;
  const stakeAmount = input.stakeAmount;
  if (!batchTxId) throw new ContractError("No batchTxId specified");
  if (!gateWayUrl) throw new ContractError("No gateWayUrl specified");
  const currentTask = task.dailyPayload[task.dailyPayload.length - 1];
  const gatewayProposed = currentTask.payloads.find(
    (payload) => payload.gateWayId === gateWayUrl
  );
  if (gatewayProposed !== undefined) {
    throw new ContractError(
      `Logs are already proposed from ${gateWayUrl} gateWay`
    );
  }
  const MAIN_CONTRACT = "Qa9SzAuwJR6xZp3UiKzokKEoRnt_utJKjFjTaSR85Xw";
  const tokenContractState = await SmartWeave.contracts.readContractState(
    MAIN_CONTRACT
  );
  const koi_tasks = tokenContractState.KOI_TASKS;
  const attentionTask = koi_tasks.find(
    (task) => task.TaskName === "AttentionGame"
  );
  for (let rewardedBlock of attentionTask.TrafficBlockRewarded) {
    const rewardDistributionReport = task.rewardReport.find(
      (distributionReport) =>
        distributionReport.dailyTrafficBlock === rewardedBlock
    );
    if (rewardDistributionReport !== undefined) {
      rewardDistributionReport.distributed = true;
    }
  }
  // if (SmartWeave.block.height > task.close - 420)
  //   throw new ContractError("proposing is closed. wait for another round");
    console.log(action);
    console.log(SmartWeave.block.height);
  console.log("======================\n");
  const vote = {
    id: state.votes.length,
    type: "trafficLogs",
    status: "active",
    voted: [],
    stakeAmount: stakeAmount,
    yays: 0,
    nays: 0,
    bundlers: {},
    start: SmartWeave.block.height,
    end: task.close
  };
  const payload = {
    TLTxId: batchTxId,
    owner: caller,
    gateWayId: gateWayUrl,
    voteId: state.votes.length,
    blockHeight: SmartWeave.block.height,
    won: false
  };
  currentTask.payloads.push(payload);
  state.votes.push(vote);
  return { state };
}
async function vote(state, action) {
  const input = action.input;
  const caller = action.caller;
  const votes = state.votes;
  const voteId = input.voteId;
  const userVote = input.userVote;
  const vote = votes[voteId];
  const voted = vote.voted;
  if (typeof userVote !== "boolean") {
    throw new ContractError(
      'Invalid value for "user vote". Must be true or false'
    );
  }
  if (!Number.isInteger(voteId)) {
    throw new ContractError(
      'Invalid value for "voting id". Must be an integer'
    );
  }
  if (SmartWeave.block.height > vote.end || vote.status == "passed")
    throw new ContractError("vote passed");
  const MAIN_CONTRACT = "Qa9SzAuwJR6xZp3UiKzokKEoRnt_utJKjFjTaSR85Xw";
  const tokenContractState = await SmartWeave.contracts.readContractState(
    MAIN_CONTRACT
  );
  const stakes = tokenContractState.stakes;
  if (stakes[caller] < vote.stakeAmount)
    throw new ContractError("staked amount is less than than required");
  if (voted.includes(caller))
    throw new ContractError("caller has alreday voted");
  if (userVote) ++vote["yays"];
  else ++vote["nays"];
  voted.push(caller);
  return { state };
}
async function migratePreRegisteredNfts(state, action) {
  const input = action.input;
  const contractId = input.contractId;
  const registeredRecords = state.registeredRecords;
  const MAIN_CONTRACT = "Qa9SzAuwJR6xZp3UiKzokKEoRnt_utJKjFjTaSR85Xw";
  const contractState = await SmartWeave.contracts.readContractState(
    MAIN_CONTRACT
  );
  const preRegisterDatas = contractState.preRegisterDatas;
  const preRegisterNfts = preRegisterDatas.filter(
    (preRegisterNft) =>
      "nftId" in preRegisterNft.content &&
      preRegisterNft.contracId === contractId
  );
  preRegisterNfts.map((preRegisterNft) => {
    if (preRegisterNft.content.nftId in registeredRecords) {
      throw new ContractError(
        `${preRegisterNft.content.nftId} is already registered`
      );
    }
    registeredRecords[preRegisterNft.content.nftId] = preRegisterNft.owner;
  });
  return { state };
}
const handlers = [
  batchAction,
  deregisterData,
  distribution,
  gateway,
  migratePreRegisteredNfts,
  proposeSlash,
  rankProposal,
  registerBundler,
  submitPayload,
  vote
];
async function handle(state, action) {
  const handler = handlers.find((fn) => fn.name === action.input.function);
  if (handler) return await handler(state, action);
  throw new ContractError(`Invalid function: "${action.input.function}"`);
}
