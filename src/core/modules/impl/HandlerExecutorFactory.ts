import Arweave from 'arweave';
import {
  Benchmark,
  ContractDefinition,
  EvalStateResult,
  ExecutionContext,
  ExecutorFactory,
  GQLNodeInterface,
  LoggerFactory,
  MemCache,
  normalizeContractSource,
  SmartWeaveGlobal,
  SwCache
} from '@smartweave';
import { ContractHandlerApi } from './ContractHandlerApi';
import loader from '@assemblyscript/loader';
import { WasmContractHandlerApi } from './WasmContractHandlerApi';
import { asWasmImports } from './wasm/as-wasm-imports';
import { rustWasmImports } from './wasm/rust-wasm-imports';
import { Go } from './wasm/go-wasm-imports';

/**
 * A factory that produces handlers that are compatible with the "current" style of
 * writing SW contracts (i.e. using "handle" function).
 */
export class HandlerExecutorFactory implements ExecutorFactory<HandlerApi<unknown>> {
  private readonly logger = LoggerFactory.INST.create('HandlerExecutorFactory');

  // TODO: cache compiled wasm binaries here.
  private readonly cache: SwCache<string, WebAssembly.Module> = new MemCache();

  constructor(private readonly arweave: Arweave) {}

  async create<State>(contractDefinition: ContractDefinition<State>): Promise<HandlerApi<State>> {
    const swGlobal = new SmartWeaveGlobal(this.arweave, {
      id: contractDefinition.txId,
      owner: contractDefinition.owner
    });

    if (contractDefinition.contractType == 'wasm') {
      this.logger.info('Creating handler for wasm contract', contractDefinition.txId);

      const benchmark = Benchmark.measure();

      let wasmInstance;
      let jsExports = null;

      switch (contractDefinition.srcWasmLang) {
        case 'assemblyscript': {
          const wasmInstanceExports = {
            exports: null
          };
          wasmInstance = loader.instantiateSync(
            contractDefinition.srcBinary,
            asWasmImports(swGlobal, wasmInstanceExports)
          );
          // note: well, exports are required by some imports
          // - e.g. those that use wasmModule.exports.__newString underneath (like Block.indep_hash)
          wasmInstanceExports.exports = wasmInstance.exports;
          break;
        }
        case 'rust': {
          const wasmInstanceExports = {
            exports: null
          };

          /**
           * wasm-bindgen mangles import function names (adds some random number after "base name")
           * - that's why we cannot statically build the imports in the SDK.
           * Instead - we need to first compile the module and check the generated
           * import function names (all imports from the "__wbindgen_placeholder__" import module).
           * Having those generated function names - we need to then map them to import functions -
           * see {@link rustWasmImports}
           *
           * That's probably a temporary solution - it would be the best to force the wasm-bindgen
           * to NOT mangle the import function names - unfortunately that is not currently possible
           * - https://github.com/rustwasm/wasm-bindgen/issues/1128
           */
          const wasmModule: WebAssembly.Module = await WebAssembly.compile(contractDefinition.srcBinary);
          const moduleImports = WebAssembly.Module.imports(wasmModule);
          const wbindgenImports = moduleImports
            .filter((imp) => {
              return imp.module === '__wbindgen_placeholder__';
            })
            .map((imp) => imp.name);

          const { imports, exports } = rustWasmImports(swGlobal, wbindgenImports, wasmInstanceExports);
          jsExports = exports;

          wasmInstance = new WebAssembly.Instance(wasmModule, imports);
          wasmInstanceExports.exports = wasmInstance.exports;
          break;
        }
        case 'go': {
          const go = new Go(swGlobal);
          go.importObject.metering = {
            usegas: function (value) {
              swGlobal.useGas(value);
            }
          };
          const wasmModule = await WebAssembly.compile(contractDefinition.srcBinary);
          wasmInstance = new WebAssembly.Instance(wasmModule, go.importObject);

          // nope - DO NOT await here!
          go.run(wasmInstance);
          jsExports = go.exports;
          break;
        }

        default: {
          throw new Error(`Support for ${contractDefinition.srcWasmLang} not implemented yet.`);
        }
      }

      this.logger.info(`WASM ${contractDefinition.srcWasmLang} handler created in ${benchmark.elapsed()}`);

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
