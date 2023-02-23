import Arweave from 'arweave';
import { ContractDefinitionLoader } from './ContractDefinitionLoader';
import { Buffer } from 'warp-isomorphic';
import { GW_TYPE } from '../InteractionsLoader';
import { ContractDefinition, ContractSource, SrcCache, ContractCache } from '../../../core/ContractDefinition';
import { SmartWeaveTags } from '../../../core/SmartWeaveTags';
import { Benchmark } from '../../../logging/Benchmark';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { ArweaveWrapper } from '../../../utils/ArweaveWrapper';
import { stripTrailingSlash } from '../../../utils/utils';
import { DefinitionLoader } from '../DefinitionLoader';
import { WasmSrc } from './wasm/WasmSrc';
import { WarpEnvironment } from '../../Warp';
import { TagsParser } from './TagsParser';
import { CacheKey, SortKeyCache, SortKeyCacheResult } from '../../../cache/SortKeyCache';
import { Transaction } from '../../../utils/types/arweave-types';

/**
 * An extension to {@link ContractDefinitionLoader} that makes use of
 * Warp Gateway ({@link https://github.com/redstone-finance/redstone-sw-gateway})
 * to load Contract Data.
 *
 * If the contract data is not available on Warp Gateway - it fallbacks to default implementation
 * in {@link ContractDefinitionLoader} - i.e. loads the definition from Arweave gateway.
 */
export class WarpGatewayContractDefinitionLoader implements DefinitionLoader {
  private readonly rLogger = LoggerFactory.INST.create('WarpGatewayContractDefinitionLoader');
  private contractDefinitionLoader: ContractDefinitionLoader;
  private arweaveWrapper: ArweaveWrapper;
  private readonly tagsParser: TagsParser;

  constructor(
    private readonly baseUrl: string,
    arweave: Arweave,
    private definitionCache: SortKeyCache<ContractCache<unknown>>,
    private srcCache: SortKeyCache<SrcCache>,
    private readonly env: WarpEnvironment
  ) {
    this.baseUrl = stripTrailingSlash(baseUrl);
    this.contractDefinitionLoader = new ContractDefinitionLoader(arweave, env);
    this.arweaveWrapper = new ArweaveWrapper(arweave);
    this.tagsParser = new TagsParser();
  }

  async load<State>(contractTxId: string, evolvedSrcTxId?: string): Promise<ContractDefinition<State>> {
    const result = await this.getFromCache<State>(contractTxId, evolvedSrcTxId);
    if (result) {
      this.rLogger.debug('WarpGatewayContractDefinitionLoader: Hit from cache!');
      // LevelDB serializes Buffer to an object with 'type' and 'data' fields
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (result.contractType == 'wasm' && (result.srcBinary as any).data) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result.srcBinary = Buffer.from((result.srcBinary as any).data);
      }
      this.verifyEnv(result);
      return result;
    }
    const benchmark = Benchmark.measure();
    const contract = await this.doLoad<State>(contractTxId, evolvedSrcTxId);
    this.rLogger.info(`Contract definition loaded in: ${benchmark.elapsed()}`);
    this.verifyEnv(contract);

    await this.putToCache(contractTxId, contract, evolvedSrcTxId);

    return contract;
  }

  async doLoad<State>(contractTxId: string, forcedSrcTxId?: string): Promise<ContractDefinition<State>> {
    try {
      const result: ContractDefinition<State> = await fetch(
        `${this.baseUrl}/gateway/contract?txId=${contractTxId}${forcedSrcTxId ? `&srcTxId=${forcedSrcTxId}` : ''}`
      )
        .then((res) => {
          return res.ok ? res.json() : Promise.reject(res);
        })
        .catch((error) => {
          if (error.body?.message) {
            this.rLogger.error(error.body.message);
          }
          throw new Error(
            `Unable to retrieve contract data. Warp gateway responded with status ${error.status}:${error.body?.message}`
          );
        });
      if (result.srcBinary != null && !(result.srcBinary instanceof Buffer)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result.srcBinary = Buffer.from((result.srcBinary as any).data);
      }
      if (result.srcBinary) {
        const wasmSrc = new WasmSrc(result.srcBinary);
        result.srcBinary = wasmSrc.wasmBinary();
        let sourceTx;
        if (result.srcTx) {
          sourceTx = new Transaction({ ...result.srcTx });
        } else {
          sourceTx = await this.arweaveWrapper.tx(result.srcTxId);
        }
        const srcMetaData = JSON.parse(this.tagsParser.getTag(sourceTx, SmartWeaveTags.WASM_META));
        result.metadata = srcMetaData;
      }
      result.contractType = result.src ? 'js' : 'wasm';
      return result;
    } catch (e) {
      this.rLogger.warn('Falling back to default contracts loader', e);
      return await this.contractDefinitionLoader.doLoad(contractTxId, forcedSrcTxId);
    }
  }

  async loadContractSource(contractSrcTxId: string): Promise<ContractSource> {
    return await this.contractDefinitionLoader.loadContractSource(contractSrcTxId);
  }

  type(): GW_TYPE {
    return 'warp';
  }

  setCache(cache: SortKeyCache<ContractCache<unknown>>): void {
    this.definitionCache = cache;
  }

  setSrcCache(cacheSrc: SortKeyCache<SrcCache>): void {
    this.srcCache = cacheSrc;
  }

  getCache(): SortKeyCache<ContractCache<unknown>> {
    return this.definitionCache;
  }

  getSrcCache(): SortKeyCache<SrcCache> {
    return this.srcCache;
  }

  private verifyEnv(def: ContractDefinition<unknown>): void {
    if (def.testnet && this.env !== 'testnet') {
      throw new Error('Trying to use testnet contract in a non-testnet env. Use the "forTestnet" factory method.');
    }
    if (!def.testnet && this.env === 'testnet') {
      throw new Error('Trying to use non-testnet contract in a testnet env.');
    }
  }

  // Gets ContractDefinition and ContractSource from two caches and returns a combined structure
  private async getFromCache<State>(contractTxId: string, srcTxId?: string): Promise<ContractDefinition<State> | null> {
    const contract = await this.definitionCache.get(new CacheKey(contractTxId, 'cd')) as SortKeyCacheResult<ContractCache<State>>;
    if (!contract) {
      return null;
    }

    const src = await this.srcCache.get(new CacheKey(srcTxId || contract.cachedValue.srcTxId, 'src'));
    if (!src) {
      return null;
    }
    return { ...contract.cachedValue, ...src.cachedValue };
  }

  // Divides ContractDefinition into entries in two caches to avoid duplicates
  private async putToCache<State>(
    contractTxId: string,
    value: ContractDefinition<State>,
    srcTxId?: string
  ): Promise<void> {
    const src = new SrcCache(value);
    const contract = new ContractCache(value);
    await this.definitionCache.put({ key: contractTxId, sortKey: 'cd' }, contract);
    await this.srcCache.put({ key: srcTxId || contract.srcTxId, sortKey: 'src' }, src);
  }
}
