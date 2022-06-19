// Create a new isolate limited to 128MB
const ivm = require('isolated-vm');
const { LoggerFactory } = require('../lib/cjs/logging/LoggerFactory');
const { SmartWeaveGlobal } = require('../lib/cjs/legacy/smartweave-global');
const { DefaultEvaluationOptions } = require('../lib/cjs/core/modules/StateEvaluator');
const Arweave = require('arweave');
const { sleep } = require('../lib/cjs/utils/utils');

const isolate = new ivm.Isolate();
const context = isolate.createContextSync();

const arweaveModule = isolate.compileModuleSync(`require('arweave')`);
arweaveModule.instantiateSync(context, function(){});
const jail = context.global;

class ContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ContractError';
  }
}

//jail.setSync('global', jail.derefInto());
jail.setSync('log', function (...args) {
  console.log(...args);
});
jail.setSync('ContractAssert', function (cond, message) {
  if (!cond) throw new ContractError(message);
});

LoggerFactory.INST.logLevel('debug');
const logger = LoggerFactory.INST.create('ContractLogger');

const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https'
});

const swGlobal = new SmartWeaveGlobal(
  arweave,
  {
    id: 'contractDefinition.txId',
    owner: 'contractDefinition.owner'
  },
  new DefaultEvaluationOptions()
);

swGlobal._activeTx = {
  id: 'PBzyHAI_cgU6yFk6s6qxcuVUmObtIkqXKFr53bjLi_k',
  fee: { winston: '72600854' },
  vrf: null,
  tags: [
    { name: 'Exchange', value: 'Pianity' },
    { name: 'Unix-Time', value: '1655708522167' },
    {
      name: 'Type',
      value: 'transfer'
    },
    { name: 'App-Name', value: 'SmartWeaveAction' },
    { name: 'App-Version', value: '0.3.0' },
    {
      name: 'SDK',
      value: 'RedStone'
    },
    { name: 'Contract', value: 'XIutiOKujGI21_ywULlBeyy-L9d8goHxt0ZyUayGaDg' },
    {
      name: 'Input',
      value:
        '{"function":"transfer","from":"tCV7bzZYD4nh1dBoDuS1i7n0bPc-QrG6BhmepH-Ali0","tokenId":"BLwqDNzoqFe_xCk593iRBbEs0MCS3FSBN9fxf2flRAs","target":"cSuVigu60yPnHiUEETRLP8woGnu_oUN5adJzqqxovn4","no":34,"price":"2000000000"}'
    }
  ],
  block: {
    id: 'KIVJS4m9IcMXtETyjL7lDhJfOJ0YdrgfTngiDPdm-Ia8Bf2P2_08gLfV-rKd9TWZ',
    height: 958129,
    timestamp: 1655708362
  },
  owner: { address: 'lEHcYq6BuDGGFzooeh-PZH2lXi00UzEBB6NiYLbE93w' },
  source: 'redstone-sequencer',
  sortKey: '000000958130,1655708523449,998dcaceb4943ee42dbb5bc19a3e5b42212b4f1de23adad77e2bdd3f9c813d87',
  quantity: { winston: '0' },
  recipient: ''
};

// logger
jail.setSync('__host__logger_info', function (...args) {
  return logger.info(...args);
});
jail.setSync('__host__logger_debug', function (...args) {
  return logger.debug(...args);
});
jail.setSync('__host__logger_error', function (...args) {
  return logger.error(...args);
});

// SmartWeave - contract
jail.setSync('__host__smartweave__contract', new ivm.ExternalCopy(swGlobal.contract));

// SmartWeave - transaction
jail.setSync('__host__smartweave__transaction_id', function (...args) {
  return swGlobal.transaction.id;
});
jail.setSync('__host__smartweave__transaction_owner', function (...args) {
  return swGlobal.transaction.owner;
});
jail.setSync('__host__smartweave__transaction_target', function (...args) {
  return swGlobal.transaction.target;
});
jail.setSync('__host__smartweave__transaction_tags', function (...args) {
  return swGlobal.transaction.tags;
});
jail.setSync('__host__smartweave__transaction_quantity', function (...args) {
  return swGlobal.transaction.quantity;
});
jail.setSync('__host__smartweave__transaction_reward', function (...args) {
  return swGlobal.transaction.reward;
});

// SmartWeave - block
jail.setSync('__host__smartweave__block_height', function (...args) {
  return swGlobal.block.height;
});
jail.setSync('__host__smartweave__block_indep_hash', function (...args) {
  return swGlobal.block.indep_hash;
});
jail.setSync('__host__smartweave__block_timestamp', function (...args) {
  return swGlobal.block.timestamp;
});

// SmartWeave - contracts
jail.setSync(
  '__host__smartweave__contracts_readContractState',
  new ivm.Reference(async function (...args) {
    console.log('Reading contract state', args[0]);
    await sleep(500);
    return new ivm.ExternalCopy({
      ticker: 'FAKE_TICKER_READ'
    });
  })
);
jail.setSync(
  '__host__smartweave__contracts_write',
  new ivm.Reference(async function (...args) {
    console.log('writing contract state', args[0]);
    await sleep(500);
    return new ivm.ExternalCopy({
      ticker: 'FAKE_TICKER_WRITE'
    });
  })
);
jail.setSync(
  '__host__smartweave__contracts_viewContractState',
  new ivm.Reference(async function (...args) {
    console.log('view contract state', args[0]);
    await sleep(500);
    return new ivm.ExternalCopy({
      ticker: 'FAKE_TICKER_VIEW'
    });
  })
);
jail.setSync(
  '__host__smartweave__contracts_refreshState',
  new ivm.Reference(async function (...args) {
    console.log('refresh contract state', args[0]);
    await sleep(500);
    return new ivm.ExternalCopy({
      ticker: 'FAKE_TICKER_REFRESH'
    });
  })
);

// SmartWeave - getBalance
jail.setSync(
  '__host__smartweave_getBalance',
  new ivm.Reference(async function (...args) {
    console.log('getBalance', args[0]);
    await sleep(500);
    return new ivm.ExternalCopy({
      balance: '234234234'
    });
  })
);

// SmartWeave - arweave
jail.setSync(
  '__host__smartweave__arweave',
  new ivm.Reference(arweave)
);

const initState = {
  counter: 0
};

const ec = new ivm.ExternalCopy(initState);
jail.setSync('state', ec.copyInto());

context.evalSync(`
  const logger = {
    info: __host__logger_info,
    debug: __host__logger_debug,
    error: __host__logger_error,
  }
  
  const SmartWeave = {
    contract: __host__smartweave__contract.copy(),
    
    getBalance: function(...args) {
      const result = __host__smartweave_getBalance.applySyncPromise(undefined, args, {});
      return result.copy();
    },
    
    contracts: {
      readContractState: function(...args) {
        const result = __host__smartweave__contracts_readContractState.applySyncPromise(undefined, args, {});
        return result.copy();
      },
      viewContractState: function(...args) {
        const result = __host__smartweave__contracts_viewContractState.applySyncPromise(undefined, args, {arguments: {copy: true}});
        return result.copy();
      },
      write: function(...args) {
        const result = __host__smartweave__contracts_write.applySyncPromise(undefined, args, {arguments: {copy: true}});
        return result.copy();
      }, 
      refreshState: function(...args) {
        const result = __host__smartweave__contracts_refreshState.applySyncPromise(undefined, args, {});
        return result.copy();
      }
    },
  
    transaction: {
      get id() { 
        return __host__smartweave__transaction_id()
      },
      get owner() { 
        return __host__smartweave__transaction_owner()
      },
      get target() { 
        return __host__smartweave__transaction_target()
      },
      get tags() { 
        return __host__smartweave__transaction_tags()
      },
      get quantity() { 
        return __host__smartweave__transaction_quantity()
      },
      get reward() { 
        return __host__smartweave__transaction_reward()
      },
    }, 
  
    block: {
      get height() { 
        return __host__smartweave__block_height()
      },
      get indep_hash() { 
        return __host__smartweave__block_indep_hash()
      },
      get timestamp() { 
        return __host__smartweave__block_timestamp()
      }
    },
    
    vrf: {
      get data() {
        return __host__smartweave__vrf_data().copy()
      },
      get value() {
        return __host__smartweave__vrf_value()
      },
      randomInt(maxValue) {
        return __host__smartweave__vrf_randomInt(maxValue)
      }
    }
  }
`);

(async function () {
  const contract = isolate.compileScriptSync(
    `
  
	async function handle(state, action) {
    logger.info(JSON.stringify(action));
    
    logger.info('SmartWeave.contract', SmartWeave.contract);
    
    logger.info('SmartWeave.block.height', SmartWeave.block.height);
    logger.info('SmartWeave.block.indep_hash', SmartWeave.block.indep_hash);
    logger.info('SmartWeave.block.timestamp', SmartWeave.block.timestamp);
    
    logger.info('SmartWeave.transaction.id', SmartWeave.transaction.id);
    logger.info('SmartWeave.transaction.owner', SmartWeave.transaction.owner);
    logger.info('SmartWeave.transaction.target', SmartWeave.transaction.target);
    logger.info('SmartWeave.transaction.tags', SmartWeave.transaction.tags);
    logger.info('SmartWeave.transaction.quantity', SmartWeave.transaction.quantity);
    logger.info('SmartWeave.transaction.reward', SmartWeave.transaction.reward);
	
	  /*logger.info('before async call');
	  const contractRead = await SmartWeave.contracts.readContractState('ctxid_2');
	  logger.info('after async call', contractRead);
	  
	  logger.info('view contract', await SmartWeave.contracts.viewContractState('ctxid_3', {function:'foo'}));
	  logger.info('write contract', await SmartWeave.contracts.write('ctxid_3', {function:'bar'}));
	  logger.info('refresh contract', await SmartWeave.contracts.refreshState());
	  
	  logger.info('getBalance', await SmartWeave.getBalance('abc'));*/
	  logger.info('__host__smartweave__arweave', __host__smartweave__arweave.getSync('ar').derefInto()['BigNum']);
	  //logger.info('__host__smartweave__arweave', __host__smartweave__arweave.getSync('wallets').apply('getBalance', [);
	  
	  
	  if (action.function === 'add') {
	    logger.info('add function called');
	    state.counter++;
	    return {state}
	  } 
	  
	  if (action.function === 'boom') {
	    logger.info('boom function called');
	    boom()
	    return {state}
	  } 
	  
	  if (action.function === 'assert') {
	    logger.info('assert function called');
	    ContractAssert(false, "ContractAssert fired");
	    return {state}
	  } 
	  
	  async function boom() {
      Object.values(null);
    }
	
	  throw new Error('Unknown function');
  }
  
  (async () => {
    await handle(state, action);
  })();
`
  );

  jail.setSync(
    'action',
    new ivm.ExternalCopy({
      function: 'add'
    }).copyInto()
  );

  await contract.run(context);
  console.log('result 1', jail.getSync('state').copySync());

  swGlobal._activeTx = {
    id: 'gEfxzS6rnYKFLnGWeOeGiBpoW5PwTG1n6xKODk1seM4',
    fee: { winston: '72600854' },
    vrf: null,
    tags: [
      { name: 'App-Name', value: 'SmartWeaveAction' },
      { name: 'App-Version', value: '0.3.0' },
      {
        name: 'SDK',
        value: 'RedStone'
      },
      { name: 'Contract', value: '5Yt1IujBmOm1LSux9KDUTjCE7rJqepzP7gZKf_DyzWI' },
      {
        name: 'Input',
        value: '{"function":"mint","qty":1}'
      }
    ],
    block: {
      id: 'Httf1v88xEOviBHK5RB3pNa816ecVVBVACNyu6Q18BQ_jg2dIOEXFYTREbMZmMTt',
      height: 958189,
      timestamp: 1655714662
    },
    owner: { address: 'JlmK4kSuOmNL7zN-QV1ZN8J7I4rofLooouSp6VzWa4M' },
    source: 'redstone-sequencer',
    sortKey: '000000958190,1655714906434,4617f513005e40568712c569a4a37d7db5ab7f059b0e96e1ff82290792ab1e57',
    quantity: { winston: '0' },
    recipient: ''
  };
  /*
  contract.runSync(context);
  console.log('result 2', jail.getSync('state').copySync());*/
  /*
  block++;
  contract.runSync(context);
  console.log('result 3', jail.getSync('state').copySync());

  block++;
  jail.setSync(
    'action',
    new ivm.ExternalCopy({
      function: 'subtract'
    }).copyInto()
  );
  try {
    contract.runSync(context);
  } catch (e) {
    console.error(e);
  }
  console.log('result 4', jail.getSync('state').copySync());

  block++;
  jail.setSync(
    'action',
    new ivm.ExternalCopy({
      function: 'boom'
    }).copyInto()
  );
  try {
    contract.runSync(context);
  } catch (e) {
    console.error(e);
  }

  block++;
  jail.setSync(
    'action',
    new ivm.ExternalCopy({
      function: 'assert'
    }).copyInto()
  );
  try {
    contract.runSync(context);
  } catch (e) {
    console.error(e);
  }

  console.log('final result', jail.getSync('state').copySync());
  console.log('initState', initState);*/
  isolate.dispose();
})().catch(console.error);
