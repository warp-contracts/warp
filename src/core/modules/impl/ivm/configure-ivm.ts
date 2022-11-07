import ivm, { Context, Reference } from 'isolated-vm';
import Arweave from 'arweave';
import { bigNumberLib } from './bigNumber-ivm';
import { SmartWeaveGlobal } from '../../../../legacy/smartweave-global';
import { LoggerFactory } from '../../../../logging/LoggerFactory';

class ContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ContractError';
  }
}

export function configureSandbox(
  sandbox: Reference<Record<number | string | symbol, any>>,
  arweave: Arweave,
  swGlobal: SmartWeaveGlobal
) {
  // ContractAssert
  sandbox.setSync('ContractAssert', function (cond, message) {
    if (!cond) throw new ContractError(message);
  });

  const logger = LoggerFactory.INST.create(`${swGlobal.contract.id}`);

  // logger
  sandbox.setSync('__host__logger_info', function (...args) {
    return logger.info(...args);
  });
  sandbox.setSync('__host__logger_debug', function (...args) {
    return logger.debug(...args);
  });
  sandbox.setSync('__host__logger_warn', function (...args) {
    return logger.warn(...args);
  });
  sandbox.setSync('__host__logger_error', function (...args) {
    return logger.error(...args);
  });

  // SmartWeave - contract
  sandbox.setSync('__host__smartweave__contract', new ivm.ExternalCopy(swGlobal.contract));

  // SmartWeave - transaction
  sandbox.setSync('__host__smartweave__transaction_id', function () {
    return swGlobal.transaction.id;
  });
  sandbox.setSync('__host__smartweave__transaction_owner', function () {
    return swGlobal.transaction.owner;
  });
  sandbox.setSync('__host__smartweave__transaction_target', function () {
    return swGlobal.transaction.target;
  });
  sandbox.setSync('__host__smartweave__transaction_tags', function (...args) {
    return swGlobal.transaction.tags;
  });
  sandbox.setSync('__host__smartweave__transaction_quantity', function () {
    return swGlobal.transaction.quantity;
  });
  sandbox.setSync('__host__smartweave__transaction_reward', function () {
    return swGlobal.transaction.reward;
  });

  // SmartWeave - block
  sandbox.setSync('__host__smartweave__block_height', function () {
    return swGlobal.block.height;
  });
  sandbox.setSync('__host__smartweave__block_indep_hash', function () {
    return swGlobal.block.indep_hash;
  });
  sandbox.setSync('__host__smartweave__block_timestamp', function () {
    return swGlobal.block.timestamp;
  });

  // SmartWeave - contracts
  sandbox.setSync(
    '__host__smartweave__contracts_readContractState',
    new ivm.Reference(async function (...args) {
      // eslint-disable-next-line prefer-spread
      const result = await swGlobal.contracts.readContractState.apply(swGlobal, args);
      return new ivm.ExternalCopy(result);
    })
  );
  sandbox.setSync(
    '__host__smartweave__contracts_write',
    new ivm.Reference(async function (...args) {
      const result = await swGlobal.contracts.write.apply(swGlobal, args);
      return new ivm.ExternalCopy(result);
    })
  );
  sandbox.setSync(
    '__host__smartweave__contracts_viewContractState',
    new ivm.Reference(async function (...args) {
      const result = await swGlobal.contracts.viewContractState.apply(swGlobal, args);
      return new ivm.ExternalCopy(result);
    })
  );
  sandbox.setSync(
    '__host__smartweave__contracts_refreshState',
    new ivm.Reference(async function (...args) {
      const result = await swGlobal.contracts.refreshState.apply(swGlobal, args);
      return new ivm.ExternalCopy(result);
    })
  );

  // SmartWeave - getBalance
  sandbox.setSync(
    '__host__smartweave_getBalance',
    new ivm.Reference(async function (...args) {
      // eslint-disable-next-line prefer-spread
      return await swGlobal.getBalance.apply(swGlobal, args);
    })
  );

  // SmartWeave - vrf
  sandbox.setSync('__host__smartweave__vrf_data', function (...args) {
    return new ivm.ExternalCopy(swGlobal.vrf.data);
  });
  sandbox.setSync('__host__smartweave__vrf_value', function () {
    return swGlobal.vrf.value;
  });
  sandbox.setSync('__host__smartweave__vrf_randomInt', function (...args) {
    return swGlobal.vrf.randomInt(args[0]);
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
  sandbox.setSync('__host__smartweave__arweave__ar_winstonToAr', new ivm.Reference(arweave.ar.winstonToAr));
  sandbox.setSync('__host__smartweave__arweave__ar_arToWinston', new ivm.Reference(arweave.ar.arToWinston));
  sandbox.setSync('__host__smartweave__arweave__ar_compare', new ivm.Reference(arweave.ar.compare));
  sandbox.setSync('__host__smartweave__arweave__ar_isEqual', new ivm.Reference(arweave.ar.isEqual));
  sandbox.setSync('__host__smartweave__arweave__ar_isLessThan', new ivm.Reference(arweave.ar.isLessThan));
  sandbox.setSync('__host__smartweave__arweave__ar_isGreaterThan', new ivm.Reference(arweave.ar.isGreaterThan));
  sandbox.setSync('__host__smartweave__arweave__ar_add', new ivm.Reference(arweave.ar.add));
  sandbox.setSync('__host__smartweave__arweave__ar_sub', new ivm.Reference(arweave.ar.sub));

  // SmartWeave - arweave - utils
  sandbox.setSync('__host__smartweave__arweave__utils_concatBuffers', new ivm.Reference(arweave.utils.concatBuffers));
  sandbox.setSync('__host__smartweave__arweave__utils_b64UrlToString', new ivm.Reference(arweave.utils.b64UrlToString));
  sandbox.setSync('__host__smartweave__arweave__utils_bufferToString', new ivm.Reference(arweave.utils.bufferToString));
  sandbox.setSync('__host__smartweave__arweave__utils_stringToBuffer', new ivm.Reference(arweave.utils.stringToBuffer));
  sandbox.setSync('__host__smartweave__arweave__utils_stringToB64Url', new ivm.Reference(arweave.utils.stringToB64Url));
  sandbox.setSync('__host__smartweave__arweave__utils_b64UrlToBuffer', new ivm.Reference(arweave.utils.b64UrlToBuffer));
  sandbox.setSync('__host__smartweave__arweave__utils_bufferTob64', new ivm.Reference(arweave.utils.bufferTob64));
  sandbox.setSync('__host__smartweave__arweave__utils_bufferTob64Url', new ivm.Reference(arweave.utils.bufferTob64Url));
  sandbox.setSync('__host__smartweave__arweave__utils_b64UrlEncode', new ivm.Reference(arweave.utils.b64UrlEncode));
  sandbox.setSync('__host__smartweave__arweave__utils_b64UrlDecode', new ivm.Reference(arweave.utils.b64UrlDecode));

  // SmartWeave - arweave - wallets
  arweave.wallets.getBalance = arweave.wallets.getBalance.bind(arweave.wallets);
  arweave.wallets.getLastTransactionID = arweave.wallets.getLastTransactionID.bind(arweave.wallets);
  arweave.wallets.generate = arweave.wallets.generate.bind(arweave.wallets);
  arweave.wallets.jwkToAddress = arweave.wallets.jwkToAddress.bind(arweave.wallets);
  arweave.wallets.getAddress = arweave.wallets.getAddress.bind(arweave.wallets);
  arweave.wallets.ownerToAddress = arweave.wallets.ownerToAddress.bind(arweave.wallets);
  sandbox.setSync(
    '__host__smartweave__arweave__wallets_getBalance',
    new ivm.Reference(async function () {
      throw new Error('this function is non-deterministic');
    })
  );
  sandbox.setSync(
    '__host__smartweave__arweave__wallets_getLastTransactionID',
    new ivm.Reference(async function () {
      throw new Error('this function is non-deterministic');
    })
  );
  sandbox.setSync(
    '__host__smartweave__arweave__wallets_generate',
    new ivm.Reference(async function () {
      throw new Error('this function is non-deterministic');
    })
  );
  sandbox.setSync('__host__smartweave__arweave__wallets_jwkToAddress', new ivm.Reference(arweave.wallets.jwkToAddress));
  sandbox.setSync('__host__smartweave__arweave__wallets_getAddress', new ivm.Reference(arweave.wallets.getAddress));
  sandbox.setSync(
    '__host__smartweave__arweave__wallets_ownerToAddress',
    new ivm.Reference(arweave.wallets.ownerToAddress)
  );

  // SmartWeave - arweave - crypto
  arweave.crypto.generateJWK = arweave.crypto.generateJWK.bind(arweave.crypto);
  arweave.crypto.sign = arweave.crypto.sign.bind(arweave.crypto);
  arweave.crypto.verify = arweave.crypto.verify.bind(arweave.crypto);
  arweave.crypto.encrypt = arweave.crypto.encrypt.bind(arweave.crypto);
  arweave.crypto.decrypt = arweave.crypto.decrypt.bind(arweave.crypto);
  arweave.crypto.hash = arweave.crypto.hash.bind(arweave.crypto);
  sandbox.setSync(
    '__host__smartweave__arweave__crypto_generateJWK',
    new ivm.Reference(async function () {
      throw new Error('this function is non-deterministic');
    })
  );
  sandbox.setSync(
    '__host__smartweave__arweave__crypto_sign',
    new ivm.Reference(async function () {
      throw new Error('this function is non-deterministic');
    })
  );
  sandbox.setSync('__host__smartweave__arweave__crypto_verify', new ivm.Reference(arweave.crypto.verify));
  sandbox.setSync('__host__smartweave__arweave__crypto_encrypt', new ivm.Reference(arweave.crypto.encrypt));
  sandbox.setSync('__host__smartweave__arweave__crypto_decrypt', new ivm.Reference(arweave.crypto.decrypt));
  sandbox.setSync(
    '__host__smartweave__arweave__crypto_hash',
    new ivm.Reference(async function (...args) {
      // eslint-disable-next-line prefer-spread
      const result = await arweave.crypto.hash.apply(arweave.crypto, args);
      return new ivm.ExternalCopy(result);
    })
  );

  // arweave - unsafeClient - transactions
  sandbox.setSync(
    '__host__smartweave__arweave__transactions_get',
    new ivm.Reference(async function (...args) {
      // eslint-disable-next-line prefer-spread
      const result = await arweave.transactions.get.apply(arweave.transactions, args);
      return new ivm.ExternalCopy(result);
    })
  );
  sandbox.setSync(
    '__host__smartweave__arweave__transactions_getData',
    new ivm.Reference(async function (...args) {
      // eslint-disable-next-line prefer-spread
      const result = await arweave.transactions.getData.apply(arweave.transactions, args);
      return new ivm.ExternalCopy(result);
    })
  );
}

export function configureContext(context: Context) {
  context.evalSync(bigNumberLib);
  context.evalSync(`
  
  class BaseObject {
      get(field, options) {
          if (!Object.getOwnPropertyNames(this).includes(field)) {
              throw new Error("Field " + field + " is not a property of the Arweave Transaction class.");
          }
          // Handle fields that are Uint8Arrays.
          // To maintain compat we encode them to b64url
          // if decode option is not specificed.
          if (this[field] instanceof Uint8Array) {
              if (options && options.decode && options.string) {
                  return ArweaveUtils.bufferToString(this[field]);
              }
              if (options && options.decode && !options.string) {
                  return this[field];
              }
              return ArweaveUtils.bufferTob64Url(this[field]);
          }
          if (options && options.decode == true) {
              if (options && options.string) {
                  return ArweaveUtils.b64UrlToString(this[field]);
              }
              return ArweaveUtils.b64UrlToBuffer(this[field]);
          }
          return this[field];
      }
  }
  class Tag extends BaseObject {
      constructor(name, value, decode = false) {
          super();
          this.name = name;
          this.value = value;
      }
  }
  
  class Transaction extends BaseObject {
      constructor(attributes = {}) {
          super();
          this.format = 2;
          this.id = "";
          this.last_tx = "";
          this.owner = "";
          this.tags = [];
          this.target = "";
          this.quantity = "0";
          this.data_size = "0";
          this.data = new Uint8Array();
          this.data_root = "";
          this.reward = "0";
          this.signature = "";
          Object.assign(this, attributes);
          if (typeof this.data === "string") {
              this.data = ArweaveUtils.b64UrlToBuffer(this.data);
          }
          if (attributes.tags) {
              this.tags = attributes.tags.map((tag) => {
                  return new Tag(tag.name, tag.value);
              });
          }
      }
      addTag(name, value) {
          this.tags.push(new Tag(ArweaveUtils.stringToB64Url(name), ArweaveUtils.stringToB64Url(value)));
      }
      toJSON() {
          return {
              format: this.format,
              id: this.id,
              last_tx: this.last_tx,
              owner: this.owner,
              tags: this.tags,
              target: this.target,
              quantity: this.quantity,
              data: ArweaveUtils.bufferTob64Url(this.data),
              data_size: this.data_size,
              data_root: this.data_root,
              data_tree: this.data_tree,
              reward: this.reward,
              signature: this.signature,
          };
      }
      setOwner(owner) {
          this.owner = owner;
      }
      setSignature({ id, owner, reward, tags, signature, }) {
          this.id = id;
          this.owner = owner;
          if (reward)
              this.reward = reward;
          if (tags)
              this.tags = tags;
          this.signature = signature;
      }
  }
  
  class ContractError extends Error {
    constructor(message) {
      super(message);
      this.name = 'ContractError';
    }
  }
  
  const logger = {
    info: __host__logger_info,
    debug: __host__logger_debug,
    warn: __host__logger_warn,
    error: __host__logger_error,
  };
  
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
    
    unsafeClient: {
      transactions: {
        get: function(...args) {
          const tx = __host__smartweave__arweave__transactions_get.applySyncPromise(undefined, args, {arguments: {copy: true}}).copy();
          return new Transaction(tx);
        },
         getData: function(...args) {
          return __host__smartweave__arweave__transactions_getData.applySyncPromise(undefined, args, {arguments: {copy: true}}).copy();
        }
      },
      wallets: {
        getBalance: function(...args) {
          return __host__smartweave__arweave__wallets_getBalance.applySyncPromise(undefined, args);
        },
        getLastTransactionID: function(...args) {
          return __host__smartweave__arweave__wallets_getLastTransactionID.applySyncPromise(undefined, args);
        },
        generate: function(...args) {
          throw __host__smartweave__arweave__wallets_generate.applySyncPromise(undefined, args).copy();
        },
        jwkToAddress: function(...args) {
          return __host__smartweave__arweave__wallets_jwkToAddress.applySyncPromise(undefined, args, {arguments: {copy: true}});
        },
        getAddress: function(...args) {
          return __host__smartweave__arweave__wallets_getAddress.applySyncPromise(undefined, args, {arguments: {copy: true}});
        },
        ownerToAddress: function(...args) {
          return __host__smartweave__arweave__wallets_ownerToAddress.applySyncPromise(undefined, args);
        }
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
          return __host__smartweave__arweave__wallets_getBalance.applySyncPromise(undefined, args);
        },
        getLastTransactionID: function(...args) {
          return __host__smartweave__arweave__wallets_getLastTransactionID.applySyncPromise(undefined, args);
        },
        generate: function(...args) {
          throw __host__smartweave__arweave__wallets_generate.applySyncPromise(undefined, args).copy();
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
      },
      
      crypto: {
        generateJWK: function(...args) {
          return __host__smartweave__arweave__crypto_generateJWK.applySyncPromise(undefined, args).copy();
        },
        sign: function(...args) {
          return __host__smartweave__arweave__crypto_sign.applySyncPromise(undefined, args, {arguments: {copy: true}}).copy();
        },
        verify: function(...args) {
          return __host__smartweave__arweave__crypto_verify.applySyncPromise(undefined, args, {arguments: {copy: true}});
        },
        encrypt: function(...args) {
          return __host__smartweave__arweave__crypto_encrypt.applySyncPromise(undefined, args, {arguments: {copy: true}}).copy();
        },
        decrypt: function(...args) {
          return __host__smartweave__arweave__crypto_decrypt.applySyncPromise(undefined, args, {arguments: {copy: true}}).copy();
        },
        hash: function(...args) {
          return __host__smartweave__arweave__crypto_hash.applySyncPromise(undefined, args, {arguments: {copy: true}}).copy();
        }
      },
    }
  };
  
  const ArweaveUtils = SmartWeave.arweave.utils;
`);
}
