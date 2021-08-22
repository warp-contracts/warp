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
  MIN_FEE = 'Min-Fee',
  INIT_STATE = 'Init-State',
  INIT_STATE_TX = 'Init-State-TX'
}
