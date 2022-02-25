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
import loader from '@assemblyscript/loader';
import { WasmContractHandlerApi } from './WasmContractHandlerApi';
import metering from 'redstone-wasm-metering';
import { asWasmImports } from './wasm/as-wasm-imports';
import { rustWasmImports } from './wasm/rust-wasm-imports';

/**
 * A factory that produces handlers that are compatible with the "current" style of
 * writing SW contracts (i.e. using "handle" function).
 */
export class HandlerExecutorFactory implements ExecutorFactory<HandlerApi<unknown>> {
  private readonly logger = LoggerFactory.INST.create('HandlerExecutorFactory');

  constructor(private readonly arweave: Arweave) {}

  async create<State>(contractDefinition: ContractDefinition<State>): Promise<HandlerApi<State>> {
    const swGlobal = new SmartWeaveGlobal(this.arweave, {
      id: contractDefinition.txId,
      owner: contractDefinition.owner
    });

    if (contractDefinition.contractType == 'wasm') {
      this.logger.info('Creating handler for wasm contract', contractDefinition.txId);

      const meteredWasmBinary = metering.meterWASM(contractDefinition.srcBinary, {
        meterType: 'i32'
      });

      let wasmInstance;

      let jsExports = null;

      switch (contractDefinition.srcWasmLang) {
        case 'assemblyscript': {
          const wasmInstanceExports = {
            exports: null
          };
          wasmInstance = loader.instantiateSync(meteredWasmBinary, asWasmImports(swGlobal, wasmInstanceExports));
          // note: well, exports are required by some imports
          // - e.g. those that use wasmModule.exports.__newString underneath (like Block.indep_hash)
          wasmInstanceExports.exports = wasmInstance.exports;
          break;
        }
        case 'rust': {
          const wasmInstanceExports = {
            exports: null
          };
          const wasmModule = new WebAssembly.Module(meteredWasmBinary);

          const { imports, exports } = rustWasmImports(swGlobal, wasmInstanceExports);
          jsExports = exports;

          this.logger.debug('Imports', imports);

          wasmInstance = new WebAssembly.Instance(wasmModule, imports);
          wasmInstanceExports.exports = wasmInstance.exports;
          break;
        }
        default: {
          throw new Error(`Support for ${contractDefinition.srcWasmLang} not implemented yet.`);
        }
      }

      return new WasmContractHandlerApi(swGlobal, contractDefinition, jsExports || wasmInstance.exports);
    } else {
      this.logger.info('Creating handler for js contract', contractDefinition.txId);
      const normalizedSource = normalizeContractSource(contractDefinition.src);

      const contractFunction = new Function(normalizedSource);

      return new ContractHandlerApi(swGlobal, contractFunction, contractDefinition);
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
  gasUsed?: number;
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
