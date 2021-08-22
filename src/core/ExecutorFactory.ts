import { ContractDefinition } from '@smartweave';

/**
 * An interface for all the factories that produce SmartWeave contracts "executors" -
 * i.e. objects that are responsible for actually running the contract's code.
 */
export interface ExecutorFactory<State = any, Api = any> {
  create(contractDefinition: ContractDefinition<State>): Promise<Api>;
}
