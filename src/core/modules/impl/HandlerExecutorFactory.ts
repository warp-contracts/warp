import Arweave from 'arweave';
import {
  ContractDefinition,
  EvalStateResult,
  ExecutionContext,
  ExecutorFactory,
  GQLNodeInterface,
  LoggerFactory,
  normalizeContractSource,
  SmartWeaveGlobal
} from '@smartweave';
import { ContractHandlerApi } from './ContractHandlerApi';
import loader from '@assemblyscript/loader/umd';
import { imports } from './wasmImports';
import { WasmContractHandlerApi } from './WasmContractHandlerApi';

/**
 * A factory that produces handlers that are compatible with the "current" style of
 * writing SW contracts (ie. using "handle" function).
 */
export class HandlerExecutorFactory implements ExecutorFactory<HandlerApi<unknown>> {
  private readonly logger = LoggerFactory.INST.create('HandlerExecutorFactory');

  constructor(private readonly arweave: Arweave) {}

  async create<State>(contractDefinition: ContractDefinition<State>): Promise<HandlerApi<State>> {
    const swGlobal = new SmartWeaveGlobal(this.arweave, {
      id: contractDefinition.txId,
      owner: contractDefinition.owner
    });

    if (contractDefinition.contractType == 'js') {
      const normalizedSource = normalizeContractSource(this.arweave.utils.bufferToString(contractDefinition.src));

      const contractFunction = new Function(normalizedSource);

      return new ContractHandlerApi(swGlobal, contractFunction, contractDefinition);
    } else {
      let wasmExports;

      const wasmModule = loader.instantiateSync(contractDefinition.src, {
        metering: {
          usegas: (gas) => {
            if (gas < 0) {
              return;
            }
            swGlobal.gasUsed += gas;
            if (swGlobal.gasUsed > swGlobal.gasLimit) {
              throw new Error(
                `[RE:OOG] Out of gas! Limit: ${formatGas(swGlobal.gasUsed)}, used: ${formatGas(swGlobal.gasLimit)}`
              );
            }
          }
        },
        console: {
          'console.log': function (msgPtr) {
            console.log(`Contract: ${wasmExports.__getString(msgPtr)}`);
          },
          'console.logO': function (msgPtr, objPtr) {
            console.log(`Contract: ${wasmExports.__getString(msgPtr)}`, JSON.parse(wasmExports.__getString(objPtr)));
          }
        },
        block: {
          'Block.height': function () {
            return 875290;
          },
          'Block.indep_hash': function () {
            return wasmExports.__newString('iIMsQJ1819NtkEUEMBRl6-7I6xkeDipn1tK4w_cDFczRuD91oAZx5qlgSDcqq1J1');
          },
          'Block.timestamp': function () {
            return 123123123;
          }
        },
        transaction: {
          'Transaction.id': function () {
            return wasmExports.__newString('Transaction.id');
          },
          'Transaction.owner': function () {
            return wasmExports.__newString('Transaction.owner');
          },
          'Transaction.target': function () {
            return wasmExports.__newString('Transaction.target');
          }
        },
        contract: {
          'Contract.id': function () {
            return wasmExports.__newString('Contract.id');
          },
          'Contract.owner': function () {
            return wasmExports.__newString('Contract.owner');
          }
        },
        msg: {
          'msg.sender': function () {
            return wasmExports.__newString('msg.sender');
          }
        },
        api: {
          _readContractState: (fnIndex, contractTxIdPtr) => {
            const contractTxId = wasmExports.__getString(contractTxIdPtr);
            const callbackFn = getFn(fnIndex);
            console.log('Simulating read state of', contractTxId);
            return setTimeout(() => {
              console.log('calling callback');
              callbackFn(
                wasmExports.__newString(
                  JSON.stringify({
                    contractTxId
                  })
                )
              );
            }, 1000);
          },
          clearTimeout
        },
        env: {
          abort(messagePtr, fileNamePtr, line, column) {
            console.error('--------------------- Error message from AssemblyScript ----------------------');
            console.error('  ' + wasmExports.__getString(messagePtr));
            console.error('    In file "' + wasmExports.__getString(fileNamePtr) + '"');
            console.error(`    on line ${line}, column ${column}.`);
            console.error('------------------------------------------------------------------------------\n');
          }
        }
      });

      function getFn(idx) {
        return wasmExports.table.get(idx);
      }

      function formatGas(gas) {
        return gas * 1e-4;
      }

      wasmExports = wasmModule.exports;

      return new WasmContractHandlerApi(swGlobal, contractDefinition, wasmExports);
    }
  }
}

export interface InteractionData<Input> {
  interaction?: ContractInteraction<Input>;
  interactionTx: GQLNodeInterface;
  currentTx: { interactionTxId: string; contractTxId: string }[];
}

/**
 * A handle that effectively runs contract's code.
 */
export interface HandlerApi<State> {
  handle<Input, Result>(
    executionContext: ExecutionContext<State>,
    currentResult: EvalStateResult<State>,
    interactionData: InteractionData<Input>
  ): Promise<InteractionResult<State, Result>>;

  initState(state: State): void;
}

export type HandlerFunction<State, Input, Result> = (
  state: State,
  interaction: ContractInteraction<Input>
) => Promise<HandlerResult<State, Result>>;

// TODO: change to XOR between result and state?
export type HandlerResult<State, Result> = {
  result: Result;
  state: State;
};

export type InteractionResult<State, Result> = HandlerResult<State, Result> & {
  type: InteractionResultType;
  errorMessage?: string;
};

export type ContractInteraction<Input> = {
  input: Input;
  caller: string;
};

export type InteractionResultType = 'ok' | 'error' | 'exception';
