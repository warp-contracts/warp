import { Buffer } from 'warp-isomorphic';
import { GW_TYPE } from '../InteractionsLoader';
import { ContractCache, ContractDefinition, ContractSource, SrcCache } from '../../ContractDefinition';
import { Benchmark } from '../../../logging/Benchmark';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { CacheableDefinitionLoader, DefinitionLoader } from '../DefinitionLoader';
import { Warp, WarpEnvironment } from '../../Warp';
import { CacheKey, SortKeyCacheResult } from '../../../cache/SortKeyCache';
import { BasicSortKeyCache } from '../../../cache/BasicSortKeyCache';
import { LevelDbCache } from '../../../cache/impl/LevelDbCache';
import { CacheOptions } from '../../WarpFactory';

/**
 * An implementation of {@link CacheableDefinitionLoader} that delegates loading contracts and caches the result.
 */
export class CacheableContractDefinitionLoader implements CacheableDefinitionLoader {
  private readonly rLogger = LoggerFactory.INST.create('CacheableContractDefinitionLoader');
  private definitionCache: BasicSortKeyCache<ContractCache<unknown>>;
  private srcCache: BasicSortKeyCache<SrcCache>;

  constructor(
    private readonly contractDefinitionLoader: DefinitionLoader,
    private readonly env: WarpEnvironment,
    cacheOptions: CacheOptions
  ) {
    this.definitionCache = new LevelDbCache<ContractCache<unknown>>({
      ...cacheOptions,
      dbLocation: `${cacheOptions.dbLocation}/contracts`
    });

    // Separate cache for sources to minimize duplicates
    this.srcCache = new LevelDbCache<SrcCache>({
      ...cacheOptions,
      dbLocation: `${cacheOptions.dbLocation}/source`
    });
  }

  async load<State>(contractTxId: string, evolvedSrcTxId?: string): Promise<ContractDefinition<State>> {
    const result = await this.getFromCache<State>(contractTxId, evolvedSrcTxId);
    if (result) {
      this.rLogger.debug('Hit from cache!', contractTxId, evolvedSrcTxId);
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
    const contract = await this.contractDefinitionLoader.load<State>(contractTxId, evolvedSrcTxId);

    this.rLogger.info(`Contract definition loaded in: ${benchmark.elapsed()}`);
    this.verifyEnv(contract);

    await this.putToCache(contractTxId, contract, evolvedSrcTxId);

    return contract;
  }

  async loadContractSource(contractSrcTxId: string): Promise<ContractSource> {
    return await this.contractDefinitionLoader.loadContractSource(contractSrcTxId);
  }

  type(): GW_TYPE {
    return this.contractDefinitionLoader.type();
  }

  setCache(cache: BasicSortKeyCache<ContractCache<unknown>>): void {
    this.definitionCache = cache;
  }

  setSrcCache(cacheSrc: BasicSortKeyCache<SrcCache>): void {
    this.srcCache = cacheSrc;
  }

  getCache(): BasicSortKeyCache<ContractCache<unknown>> {
    return this.definitionCache;
  }

  getSrcCache(): BasicSortKeyCache<SrcCache> {
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
    const contract = (await this.definitionCache.get(new CacheKey(contractTxId, 'cd'))) as SortKeyCacheResult<
      ContractCache<State>
    >;

    if (!contract) {
      return null;
    }
    const effectiveSrcTxId = srcTxId || contract.cachedValue.srcTxId;

    const src = await this.srcCache.get(new CacheKey(effectiveSrcTxId, 'src'));
    if (!src) {
      return null;
    }
    return { ...contract.cachedValue, ...src.cachedValue, srcTxId: effectiveSrcTxId };
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

  set warp(warp: Warp) {
    this.contractDefinitionLoader.warp = warp;
  }
}
