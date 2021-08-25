import { ContractDefinition } from '@smartweave';

/**
 * Implementors of this interface are responsible for loading contract's definitions -
 * its source code, info about owner, initial state, etc.
 * See ContractDefinition type for more details regarding what data is being loaded.
 */
export interface DefinitionLoader {
  load<State>(contractTxId: string, forcedSrcTxId?: string): Promise<ContractDefinition<State>>;
}
