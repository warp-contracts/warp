import { ContractCache, ContractDefinition, ContractSource, SrcCache } from '../../core/ContractDefinition';
import { GwTypeAware } from './InteractionsLoader';
import { SortKeyCache } from '../../cache/SortKeyCache';

/**
 * Implementors of this interface are responsible for loading contract's definitions -
 * its source code, info about owner, initial state, etc.
 * See ContractDefinition type for more details regarding what data is being loaded.
 */
export interface DefinitionLoader extends GwTypeAware {
  load<State>(contractTxId: string, evolvedSrcTxId?: string): Promise<ContractDefinition<State>>;

  loadContractSource(srcTxId: string): Promise<ContractSource>;

  setCache(cache: SortKeyCache<ContractCache<unknown>>): void;

  // Cache for storing common source code or binaries
  setSrcCache(cacheSrc?: SortKeyCache<SrcCache>): void;

  getCache(): SortKeyCache<ContractCache<unknown>>;

  getSrcCache(): SortKeyCache<SrcCache>;
}
