/* tslint:disable */
/* eslint-disable */
/* a kind of magic */
import {LoggerFactory, timeout} from "@smartweave";

export const rustWasmImports = (swGlobal, wasmInstance: any): any => {
  const wasmLogger = LoggerFactory.INST.create('WASM');

  //const wasm = wasmInstance.exports;

  const rawImports = {
    metering: {
      usegas: swGlobal.useGas
    },
    "console": {
      log: function (value) {
        wasmLogger.debug(`${swGlobal.contract.id}: ${value}`);
      }
    },
    "Block": {
      height: function () {
        return swGlobal.block.height;
      },
      indep_hash: function () {
        return swGlobal.block.indep_hash;
      },
      timestamp: function () {
        return swGlobal.block.timestamp;
      }
    },
    "Transaction": {
      id: function () {
        return swGlobal.transaction.id;
      },
      owner: function () {
        return swGlobal.transaction.owner;
      },
      target: function () {
        return swGlobal.transaction.target;
      },
    },
    "Contract": {
      id: function () {
        return swGlobal.contract.id;
      },
      owner: function () {
        return swGlobal.contract.owner;
      }
    },
    "SmartWeave": {
      readContractState: async function (contractTxId) {
        console.log('js: readContractState before timeout');
        await timeout(1000);
        console.log('js: readContractState after timeout');
        return {
          value: contractTxId
        }
      }
    }
  }

  let exports: any = {};
  let imports: any = {};

  imports['__wbindgen_placeholder__'] = exports;

  const {TextDecoder, TextEncoder} = require(`util`);

  let cachedTextDecoder = new TextDecoder('utf-8', {ignoreBOM: true, fatal: true});

  cachedTextDecoder.decode();

  let cachegetUint8Memory0 = null;

  function getUint8Memory0() {
    if (cachegetUint8Memory0 === null || cachegetUint8Memory0.buffer !== wasmInstance.exports.memory.buffer) {
      cachegetUint8Memory0 = new Uint8Array(wasmInstance.exports.memory.buffer);
    }
    return cachegetUint8Memory0;
  }

  function getStringFromWasm0(ptr, len) {
    return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
  }

  const heap = new Array(32).fill(undefined);

  heap.push(undefined, null, true, false);

  let heap_next = heap.length;

  function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
  }

  function getObject(idx) {
    return heap[idx];
  }

  let WASM_VECTOR_LEN = 0;

  let cachedTextEncoder = new TextEncoder('utf-8');

  const encodeString = (typeof cachedTextEncoder.encodeInto === 'function'
    ? function (arg, view) {
      return cachedTextEncoder.encodeInto(arg, view);
    }
    : function (arg, view) {
      const buf = cachedTextEncoder.encode(arg);
      view.set(buf);
      return {
        read: arg.length,
        written: buf.length
      };
    });

  function passStringToWasm0(arg, malloc, realloc) {

    if (realloc === undefined) {
      const buf = cachedTextEncoder.encode(arg);
      const ptr = malloc(buf.length);
      getUint8Memory0().subarray(ptr, ptr + buf.length).set(buf);
      WASM_VECTOR_LEN = buf.length;
      return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len);

    const mem = getUint8Memory0();

    let offset = 0;

    for (; offset < len; offset++) {
      const code = arg.charCodeAt(offset);
      if (code > 0x7F) break;
      mem[ptr + offset] = code;
    }

    if (offset !== len) {
      if (offset !== 0) {
        arg = arg.slice(offset);
      }
      ptr = realloc(ptr, len, len = offset + arg.length * 3);
      const view = getUint8Memory0().subarray(ptr + offset, ptr + len);
      const ret = encodeString(arg, view);

      offset += ret.written;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
  }

  let cachegetInt32Memory0 = null;

  function getInt32Memory0() {
    if (cachegetInt32Memory0 === null || cachegetInt32Memory0.buffer !== wasmInstance.exports.memory.buffer) {
      cachegetInt32Memory0 = new Int32Array(wasmInstance.exports.memory.buffer);
    }
    return cachegetInt32Memory0;
  }

  function dropObject(idx) {
    if (idx < 36) return;
    heap[idx] = heap_next;
    heap_next = idx;
  }

  function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
  }

  function debugString(val) {
    // primitive types
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) {
      return `${val}`;
    }
    if (type == 'string') {
      return `"${val}"`;
    }
    if (type == 'symbol') {
      const description = val.description;
      if (description == null) {
        return 'Symbol';
      } else {
        return `Symbol(${description})`;
      }
    }
    if (type == 'function') {
      const name = val.name;
      if (typeof name == 'string' && name.length > 0) {
        return `Function(${name})`;
      } else {
        return 'Function';
      }
    }
    // objects
    if (Array.isArray(val)) {
      const length = val.length;
      let debug = '[';
      if (length > 0) {
        debug += debugString(val[0]);
      }
      for (let i = 1; i < length; i++) {
        debug += ', ' + debugString(val[i]);
      }
      debug += ']';
      return debug;
    }
    // Test for built-in
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (builtInMatches.length > 1) {
      className = builtInMatches[1];
    } else {
      // Failed to match the standard '[object ClassName]'
      return toString.call(val);
    }
    if (className == 'Object') {
      // we're a user defined class or Object
      // JSON.stringify avoids problems with cycles, and is generally much
      // easier than looping through ownProperties of `val`.
      try {
        return 'Object(' + JSON.stringify(val) + ')';
      } catch (_) {
        return 'Object';
      }
    }
    // errors
    if (val instanceof Error) {
      return `${val.name}: ${val.message}\n${val.stack}`;
    }
    // TODO we could test for more things here, like `Set`s and `Map`s.
    return className;
  }

  function makeMutClosure(arg0, arg1, dtor, f) {
    const state = {a: arg0, b: arg1, cnt: 1, dtor};
    const real = (...args) => {
      // First up with a closure we increment the internal reference
      // count. This ensures that the Rust closure environment won't
      // be deallocated while we're invoking it.
      state.cnt++;
      const a = state.a;
      state.a = 0;
      try {
        return f(a, state.b, ...args);
      } finally {
        if (--state.cnt === 0) {
          wasmInstance.exports.__wbindgen_export_2.get(state.dtor)(a, state.b);

        } else {
          state.a = a;
        }
      }
    };
    real.original = state;

    return real;
  }

  function __wbg_adapter_14(arg0, arg1, arg2) {
    wasmInstance.exports._dyn_core__ops__function__FnMut__A____Output___R_as_wasm_bindgen__closure__WasmClosure___describe__invoke__h0af8cf16c8647f23(arg0, arg1, addHeapObject(arg2));
  }

  /**
   * @param {any} interaction
   * @returns {Promise<any>}
   */
  exports.handle = function (interaction) {
    console.log("handleeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", interaction);
    console.log("handleeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", wasmInstance.exports.handle);
    var ret = wasmInstance.exports.handle(addHeapObject(interaction));
    return takeObject(ret);
  };

  let stack_pointer = 32;

  function addBorrowedObject(obj) {
    if (stack_pointer == 1) throw new Error('out of js stack');
    heap[--stack_pointer] = obj;
    return stack_pointer;
  }

  /**
   * @param {any} state
   */
  exports.initState = function (state) {
    console.log("INIT STATE11111111");
    try {
      console.log(state);
      wasmInstance.exports.initState(addBorrowedObject(state));
    } finally {
      heap[stack_pointer++] = undefined;
    }
  };

  /**
   * @returns {any}
   */
  exports.currentState = function () {
    var ret = wasmInstance.exports.currentState();
    return takeObject(ret);
  };

  /**
   * @returns {string}
   */
  exports.lang = function () {
    try {
      const retptr = wasmInstance.exports.__wbindgen_add_to_stack_pointer(-16);
      wasmInstance.exports.lang(retptr);
      var r0 = getInt32Memory0()[retptr / 4 + 0];
      var r1 = getInt32Memory0()[retptr / 4 + 1];
      return getStringFromWasm0(r0, r1);
    } finally {
      wasmInstance.exports.__wbindgen_add_to_stack_pointer(16);
      wasmInstance.exports.__wbindgen_free(r0, r1);
    }
  };

  /**
   * @returns {number}
   */
  exports.type = function () {
    var ret = wasmInstance.exports.type();
    return ret;
  };

  function handleError(f, args) {
    try {
      return f.apply(this, args);
    } catch (e) {
      wasmInstance.exports.__wbindgen_exn_store(addHeapObject(e));
    }
  }

  function __wbg_adapter_42(arg0, arg1, arg2, arg3) {
    wasmInstance.exports.wasm_bindgen__convert__closures__invoke2_mut__h1aa5ebac0642c58b(arg0, arg1, addHeapObject(arg2), addHeapObject(arg3));
  }

  /**
   */
  class StateWrapper {

    __destroy_into_raw() {
      // @ts-ignore
      const ptr = this.ptr;
      // @ts-ignore
      this.ptr = 0;

      return ptr;
    }

    free() {
      const ptr = this.__destroy_into_raw();
      wasmInstance.exports.__wbg_statewrapper_free(ptr);
    }
  }

  exports.StateWrapper = StateWrapper;

  exports.__wbg_indephash_5169b74d7073ec06 = function (arg0) {
    console.log("block indep hash");
    var ret = rawImports.Block.indep_hash();
    var ptr0 = passStringToWasm0(ret, wasmInstance.exports.__wbindgen_malloc, wasmInstance.exports.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    getInt32Memory0()[arg0 / 4 + 1] = len0;
    getInt32Memory0()[arg0 / 4 + 0] = ptr0;
  };

  exports.__wbg_height_7e2d5ab154a32c53 = function () {
    var ret = rawImports.Block.height();
    return ret;
  };

  exports.__wbg_timestamp_b2ae03e8830bf361 = function () {
    var ret = rawImports.Block.timestamp();
    return ret;
  };

  exports.__wbg_id_96159534c1352b1f = function () {
    var ret = rawImports.Contract.id();
    return ret;
  };

  exports.__wbg_owner_584edbeb2fc79632 = function (arg0) {
    var ret = rawImports.Contract.owner();
    var ptr0 = passStringToWasm0(ret, wasmInstance.exports.__wbindgen_malloc, wasmInstance.exports.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    getInt32Memory0()[arg0 / 4 + 1] = len0;
    getInt32Memory0()[arg0 / 4 + 0] = ptr0;
  };

  exports.__wbg_id_004f7156a1dccfe0 = function () {
    var ret = rawImports.Transaction.id();
    return ret;
  };

  exports.__wbg_owner_3b98731ef4bca542 = function (arg0) {
    var ret = rawImports.Transaction.owner();
    var ptr0 = passStringToWasm0(ret, wasmInstance.exports.__wbindgen_malloc, wasmInstance.exports.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    getInt32Memory0()[arg0 / 4 + 1] = len0;
    getInt32Memory0()[arg0 / 4 + 0] = ptr0;
  };

  exports.__wbg_target_900d26a5419b4869 = function (arg0) {
    var ret = rawImports.Transaction.target();
    var ptr0 = passStringToWasm0(ret, wasmInstance.exports.__wbindgen_malloc, wasmInstance.exports.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    getInt32Memory0()[arg0 / 4 + 1] = len0;
    getInt32Memory0()[arg0 / 4 + 0] = ptr0;
  };

  exports.__wbg_log_5f1f23db3aa2a6c6 = function (arg0, arg1) {
    rawImports.console.log(getStringFromWasm0(arg0, arg1));
  };

  exports.__wbindgen_json_parse = function (arg0, arg1) {
    var ret = JSON.parse(getStringFromWasm0(arg0, arg1));
    return addHeapObject(ret);
  };

  exports.__wbindgen_json_serialize = function (arg0, arg1) {
    const obj = getObject(arg1);
    var ret = JSON.stringify(obj === undefined ? null : obj);
    var ptr0 = passStringToWasm0(ret, wasmInstance.exports.__wbindgen_malloc, wasmInstance.exports.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    getInt32Memory0()[arg0 / 4 + 1] = len0;
    getInt32Memory0()[arg0 / 4 + 0] = ptr0;
  };

  exports.__wbindgen_object_drop_ref = function (arg0) {
    takeObject(arg0);
  };

  exports.__wbindgen_cb_drop = function (arg0) {
    const obj = takeObject(arg0).original;
    if (obj.cnt-- == 1) {
      obj.a = 0;
      return true;
    }
    var ret = false;
    return ret;
  };

  exports.__wbg_readContractState_251600c2ccc5a557 = function (arg0, arg1) {
    var ret = rawImports.SmartWeave.readContractState(getStringFromWasm0(arg0, arg1));
    return addHeapObject(ret);
  };

  exports.__wbg_call_94697a95cb7e239c = function () {
    return handleError(function (arg0, arg1, arg2) {
      var ret = getObject(arg0).call(getObject(arg1), getObject(arg2));
      return addHeapObject(ret);
    }, arguments)
  };

  exports.__wbg_new_4beacc9c71572250 = function (arg0, arg1) {
    try {
      var state0 = {a: arg0, b: arg1};
      var cb0 = (arg0, arg1) => {
        const a = state0.a;
        state0.a = 0;
        try {
          return __wbg_adapter_42(a, state0.b, arg0, arg1);
        } finally {
          state0.a = a;
        }
      };
      var ret = new Promise(cb0);
      return addHeapObject(ret);
    } finally {
      state0.a = state0.b = 0;
    }
  };

  exports.__wbg_resolve_4f8f547f26b30b27 = function (arg0) {
    var ret = Promise.resolve(getObject(arg0));
    return addHeapObject(ret);
  };

  exports.__wbg_then_a6860c82b90816ca = function (arg0, arg1) {
    var ret = getObject(arg0).then(getObject(arg1));
    return addHeapObject(ret);
  };

  exports.__wbg_then_58a04e42527f52c6 = function (arg0, arg1, arg2) {
    var ret = getObject(arg0).then(getObject(arg1), getObject(arg2));
    return addHeapObject(ret);
  };

  exports.__wbindgen_debug_string = function (arg0, arg1) {
    var ret = debugString(getObject(arg1));
    var ptr0 = passStringToWasm0(ret, wasmInstance.exports.__wbindgen_malloc, wasmInstance.exports.__wbindgen_realloc);
    var len0 = WASM_VECTOR_LEN;
    getInt32Memory0()[arg0 / 4 + 1] = len0;
    getInt32Memory0()[arg0 / 4 + 0] = ptr0;
  };

  exports.__wbindgen_throw = function (arg0, arg1) {
    throw new Error(getStringFromWasm0(arg0, arg1));
  };

  exports.__wbindgen_closure_wrapper218 = function (arg0, arg1, arg2) {
    var ret = makeMutClosure(arg0, arg1, 75, __wbg_adapter_14);
    return addHeapObject(ret);
  };

  imports.metering = rawImports.metering;

  return {imports, exports};
}
