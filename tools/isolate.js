// Create a new isolate limited to 128MB
const ivm = require('isolated-vm');
const { LoggerFactory } = require('../lib/cjs/logging/LoggerFactory');
const { SmartWeaveGlobal } = require('../lib/cjs/legacy/smartweave-global');
const { DefaultEvaluationOptions } = require('../lib/cjs/core/modules/StateEvaluator');
const Arweave = require('arweave');
const { sleep } = require('../lib/cjs/utils/utils');
const {concatBuffers, b64UrlToString, bufferToString, stringToBuffer, stringToB64Url, b64UrlToBuffer, bufferTob64,
  bufferTob64Url, b64UrlEncode, b64UrlDecode
} = require("arweave/node/lib/utils");

const isolate = new ivm.Isolate();
const context = isolate.createContextSync();

const arweaveModule = isolate.compileModuleSync(`require('arweave')`);
arweaveModule.instantiateSync(context, function () {});
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
/*
arweave.transactions.get()
arweave.transactions.getData()*/

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
    await sleep(500);
    return new ivm.ExternalCopy({
      ticker: 'FAKE_TICKER_READ'
    });
  })
);
jail.setSync(
  '__host__smartweave__contracts_write',
  new ivm.Reference(async function (...args) {
    await sleep(500);
    return new ivm.ExternalCopy({
      ticker: 'FAKE_TICKER_WRITE'
    });
  })
);
jail.setSync(
  '__host__smartweave__contracts_viewContractState',
  new ivm.Reference(async function (...args) {
    await sleep(500);
    return new ivm.ExternalCopy({
      ticker: 'FAKE_TICKER_VIEW'
    });
  })
);
jail.setSync(
  '__host__smartweave__contracts_refreshState',
  new ivm.Reference(async function (...args) {
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
    await sleep(500);
    return new ivm.ExternalCopy({
      balance: '234234234'
    });
  })
);

// SmartWeave - vrf
jail.setSync('__host__smartweave__vrf_data', function (...args) {
  return new ivm.ExternalCopy(swGlobal.vrf.data);
});
jail.setSync('__host__smartweave__vrf_value', function (...args) {
  return swGlobal.vrf.value;
});
jail.setSync('__host__smartweave__vrf_randomInt', function (...args) {
  return swGlobal.vrf.randomInt(args);
});

// SmartWeave - arweave - ar
arweave.ar.winstonToAr = arweave.ar.winstonToAr.bind(arweave.ar);
arweave.ar.arToWinston = arweave.ar.arToWinston.bind(arweave.ar);
arweave.ar.compare = arweave.ar.compare.bind(arweave.ar);
arweave.ar.isEqual = arweave.ar.isEqual.bind(arweave.ar);
arweave.ar.isLessThan = arweave.ar.isLessThan.bind(arweave.ar);
arweave.ar.isGreaterThan = arweave.ar.isGreaterThan.bind(arweave.ar);
arweave.ar.add = arweave.ar.add.bind(arweave.ar);
arweave.ar.sub = arweave.ar.sub.bind(arweave.ar);
jail.setSync('__host__smartweave__arweave__ar_winstonToAr', new ivm.Reference(arweave.ar.winstonToAr));
jail.setSync('__host__smartweave__arweave__ar_arToWinston', new ivm.Reference(arweave.ar.arToWinston));
jail.setSync('__host__smartweave__arweave__ar_compare', new ivm.Reference(arweave.ar.compare));
jail.setSync('__host__smartweave__arweave__ar_isEqual', new ivm.Reference(arweave.ar.isEqual));
jail.setSync('__host__smartweave__arweave__ar_isLessThan', new ivm.Reference(arweave.ar.isLessThan));
jail.setSync('__host__smartweave__arweave__ar_isGreaterThan', new ivm.Reference(arweave.ar.isGreaterThan));
jail.setSync('__host__smartweave__arweave__ar_add', new ivm.Reference(arweave.ar.add));
jail.setSync('__host__smartweave__arweave__ar_sub', new ivm.Reference(arweave.ar.sub));

// SmartWeave - arweave - utils
jail.setSync('__host__smartweave__arweave__utils_concatBuffers', new ivm.Reference(arweave.utils.concatBuffers));
jail.setSync('__host__smartweave__arweave__utils_b64UrlToString', new ivm.Reference(arweave.utils.b64UrlToString));
jail.setSync('__host__smartweave__arweave__utils_bufferToString', new ivm.Reference(arweave.utils.bufferToString));
jail.setSync('__host__smartweave__arweave__utils_stringToBuffer', new ivm.Reference(arweave.utils.stringToBuffer));
jail.setSync('__host__smartweave__arweave__utils_stringToB64Url', new ivm.Reference(arweave.utils.stringToB64Url));
jail.setSync('__host__smartweave__arweave__utils_b64UrlToBuffer', new ivm.Reference(arweave.utils.b64UrlToBuffer));
jail.setSync('__host__smartweave__arweave__utils_bufferTob64', new ivm.Reference(arweave.utils.bufferTob64));
jail.setSync('__host__smartweave__arweave__utils_bufferTob64Url', new ivm.Reference(arweave.utils.bufferTob64Url));
jail.setSync('__host__smartweave__arweave__utils_b64UrlEncode', new ivm.Reference(arweave.utils.b64UrlEncode));
jail.setSync('__host__smartweave__arweave__utils_b64UrlDecode', new ivm.Reference(arweave.utils.b64UrlDecode));

// SmartWeave - arweave - wallets
arweave.wallets.getBalance = arweave.wallets.getBalance.bind(arweave.wallets);
arweave.wallets.getLastTransactionID = arweave.wallets.getLastTransactionID.bind(arweave.wallets);
arweave.wallets.generate = arweave.wallets.generate.bind(arweave.wallets);
arweave.wallets.jwkToAddress = arweave.wallets.jwkToAddress.bind(arweave.wallets);
arweave.wallets.getAddress = arweave.wallets.getAddress.bind(arweave.wallets);
arweave.wallets.ownerToAddress = arweave.wallets.ownerToAddress.bind(arweave.wallets);
jail.setSync('__host__smartweave__arweave__wallets_getBalance', new ivm.Reference(arweave.wallets.getBalance));
jail.setSync(
  '__host__smartweave__arweave__wallets_getLastTransactionID',
  new ivm.Reference(arweave.wallets.getLastTransactionID)
);
jail.setSync(
  '__host__smartweave__arweave__wallets_generate',
  new ivm.Reference(async function (...args) {
    const result = await arweave.wallets.generate();
    return new ivm.ExternalCopy(result);
  })
);
jail.setSync('__host__smartweave__arweave__wallets_jwkToAddress', new ivm.Reference(arweave.wallets.jwkToAddress));
jail.setSync('__host__smartweave__arweave__wallets_getAddress', new ivm.Reference(arweave.wallets.getAddress));
jail.setSync('__host__smartweave__arweave__wallets_ownerToAddress', new ivm.Reference(arweave.wallets.ownerToAddress));

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
        return __host__smartweave__transaction_id();
      },
      get owner() { 
        return __host__smartweave__transaction_owner();
      },
      get target() { 
        return __host__smartweave__transaction_target();
      },
      get tags() { 
        return __host__smartweave__transaction_tags();
      },
      get quantity() { 
        return __host__smartweave__transaction_quantity();
      },
      get reward() { 
        return __host__smartweave__transaction_reward();
      },
    }, 
  
    block: {
      get height() { 
        return __host__smartweave__block_height();
      },
      get indep_hash() { 
        return __host__smartweave__block_indep_hash();
      },
      get timestamp() { 
        return __host__smartweave__block_timestamp();
      }
    },
    
    vrf: {
      get data() {
        return __host__smartweave__vrf_data().copy();
      },
      get value() {
        return __host__smartweave__vrf_value();
      },
      randomInt(maxValue) {
        return __host__smartweave__vrf_randomInt(maxValue);
      }
    },
    
    arweave: {
      ar: {
        winstonToAr: function(...args) {
          return __host__smartweave__arweave__ar_winstonToAr.applySync(undefined, args, {arguments: {copy: true}});
        },
        arToWinston: function(...args) {
          return __host__smartweave__arweave__ar_arToWinston.applySync(undefined, args, {arguments: {copy: true}});
        },
        compare: function(...args) {
          return __host__smartweave__arweave__ar_compare.applySync(undefined, args);
        },
        isEqual: function(...args) {
          return __host__smartweave__arweave__ar_isEqual.applySync(undefined, args);
        },
        isLessThan: function(...args) {
          return __host__smartweave__arweave__ar_isLessThan.applySync(undefined, args);
        },
        isGreaterThan: function(...args) {
          return __host__smartweave__arweave__ar_isGreaterThan.applySync(undefined, args);
        },
        add: function(...args) {
          return __host__smartweave__arweave__ar_add.applySync(undefined, args);
        },
        sub: function(...args) {
          return __host__smartweave__arweave__ar_sub.applySync(undefined, args);
        },
      },
      
      utils: {
        concatBuffers: function(...args) {
          return __host__smartweave__arweave__utils_concatBuffers.applySync(undefined, args, {arguments: {copy: true}, result: {copy: true}});
        },
        b64UrlToString: function(...args) {
          return __host__smartweave__arweave__utils_b64UrlToString.applySync(undefined, args);
        },
        bufferToString: function(...args) {
          return __host__smartweave__arweave__utils_bufferToString.applySync(undefined, args, {arguments: {copy: true}});
        },
        stringToBuffer: function(...args) {
          return __host__smartweave__arweave__utils_stringToBuffer.applySync(undefined, args, {result: {copy: true}});
        },
        stringToB64Url: function(...args) {
          return __host__smartweave__arweave__utils_stringToB64Url.applySync(undefined, args);
        },
        b64UrlToBuffer: function(...args) {
          return __host__smartweave__arweave__utils_b64UrlToBuffer.applySync(undefined, args, {result: {copy: true}});
        },
        bufferTob64: function(...args) {
          return __host__smartweave__arweave__utils_bufferTob64.applySync(undefined, args, {arguments: {copy: true}});
        },
        bufferTob64Url: function(...args) {
          return __host__smartweave__arweave__utils_bufferTob64Url.applySync(undefined, args, {arguments: {copy: true}});
        },
        b64UrlEncode: function(...args) {
          return __host__smartweave__arweave__utils_b64UrlEncode.applySync(undefined, args);
        },
        b64UrlDecode: function(...args) {
          return __host__smartweave__arweave__utils_b64UrlDecode.applySync(undefined, args);
        }
      },
    
      wallets: {
        getBalance: function(...args) {
          throw new Error('this function is non-deterministic');
        },
        getLastTransactionID: function(...args) {
          throw new Error('this function is non-deterministic');
        },
        generate: function(...args) {
          throw new Error('this function is non-deterministic');
        },
        jwkToAddress: function(...args) {
          return __host__smartweave__arweave__wallets_jwkToAddress.applySyncPromise(undefined, args, {arguments: {copy: true}});
        },
        getAddress: function(...args) {
          return __host__smartweave__arweave__wallets_getAddress.applySyncPromise(undefined, args, {arguments: {copy: true}});
        },
        ownerToAddress: function(...args) {
          return __host__smartweave__arweave__wallets_ownerToAddress.applySyncPromise(undefined, args);
        },
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
      
      // logger.info('SmartWeave.arweave.wallets.getBalance', await SmartWeave.arweave.wallets.getBalance('33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA'));
      // logger.info('SmartWeave.arweave.wallets.getLastTransactionID', await SmartWeave.arweave.wallets.getLastTransactionID('33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA'));
      // const jwk = await SmartWeave.arweave.wallets.generate();
      // logger.info('SmartWeave.arweave.wallets.generate', jwk);
      // logger.info('SmartWeave.arweave.wallets.jwkToAddress', SmartWeave.arweave.wallets.jwkToAddress(jwk));
      // logger.info('SmartWeave.arweave.wallets.getAddress', SmartWeave.arweave.wallets.getAddress(jwk));
      logger.info('SmartWeave.arweave.ar.winstonToAr', SmartWeave.arweave.ar.winstonToAr('234234242', {formatted: true, decimals: 6}));
      logger.info('SmartWeave.arweave.ar.arToWinston', SmartWeave.arweave.ar.arToWinston('1.5', {formatted: true}));
      logger.info('SmartWeave.arweave.ar.add', SmartWeave.arweave.ar.add('242342', '23423424'));
      logger.info('SmartWeave.arweave.utils.concatBuffers', SmartWeave.arweave.utils.concatBuffers([new Uint8Array([21,31]), new Uint8Array([21,31])]));
      logger.info('SmartWeave.arweave.utils.bufferToString', SmartWeave.arweave.utils.bufferToString(new Uint8Array([21,31])));
      logger.info('SmartWeave.arweave.utils.stringToBuffer', SmartWeave.arweave.utils.stringToBuffer('duh'));
      logger.info('SmartWeave.arweave.utils.stringToB64Url', SmartWeave.arweave.utils.stringToB64Url('duh'));
      logger.info('SmartWeave.arweave.utils.b64UrlToBuffer', SmartWeave.arweave.utils.b64UrlToBuffer('duh'));
      logger.info('SmartWeave.arweave.utils.bufferTob64', SmartWeave.arweave.utils.bufferTob64(new Uint8Array([21,31])));
      logger.info('SmartWeave.arweave.utils.bufferTob64Url', SmartWeave.arweave.utils.bufferTob64Url(new Uint8Array([21,31])));
      logger.info('SmartWeave.arweave.utils.b64UrlEncode', SmartWeave.arweave.utils.b64UrlEncode('asdasd'));
      logger.info('SmartWeave.arweave.utils.b64UrlDecode', SmartWeave.arweave.utils.b64UrlDecode('asdasd'));
      
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

  try {
    await contract.run(context);
  } catch (e) {
    console.error(e);
  }
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
