/**
 * Definition of all transaction tags used by the SmartWeave "protocol"
 */
export enum SmartWeaveTags {
  APP_NAME = 'App-Name',
  APP_VERSION = 'App-Version',
  CONTRACT_TX_ID = 'Contract', // note: should be named Contract-Tx-Id
  INPUT = 'Input',
  CONTENT_TYPE = 'Content-Type',
  CONTRACT_SRC_TX_ID = 'Contract-Src', // note: should be named Contract-Src-Tx-Id
  SDK = 'SDK',
  MIN_FEE = 'Min-Fee',
  INIT_STATE = 'Init-State',
  INIT_STATE_TX = 'Init-State-TX',
  INTERACT_WRITE = 'Interact-Write',
  WASM_LANG = 'Wasm-Lang',
  WASM_LANG_VERSION = 'Wasm-Lang-Version',
  CONTRACT_TYPE = 'Contract-Type',
  WASM_META = 'Wasm-Meta'
}
