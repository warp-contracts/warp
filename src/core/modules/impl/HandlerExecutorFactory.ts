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
import { imports } from './wasmImports';
import { WasmContractHandlerApi } from './WasmContractHandlerApi';
import metering from 'wasm-metering';

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
      this.logger.info('Creating handler for js contract', contractDefinition.txId);
      const normalizedSource =
        contractDefinition.src instanceof Buffer
          ? normalizeContractSource(this.arweave.utils.bufferToString(contractDefinition.src))
          : normalizeContractSource(contractDefinition.src);

      const contractFunction = new Function(normalizedSource);

      return new ContractHandlerApi(swGlobal, contractFunction, contractDefinition);
    } else {
      this.logger.info('Creating handler for wasm contract', contractDefinition.txId);

      const wasmModuleData = {
        exports: null
      };

      const meteredWasmBinary = metering.meterWASM(contractDefinition.src, {
        meterType: 'i32'
      });

      const wasmModule = loader.instantiateSync(meteredWasmBinary, imports(swGlobal, wasmModuleData));

      wasmModuleData.exports = wasmModule.exports;

      return new WasmContractHandlerApi(swGlobal, contractDefinition, wasmModule.exports);
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
