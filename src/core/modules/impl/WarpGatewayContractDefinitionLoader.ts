import Arweave from 'arweave';
import { ContractDefinitionLoader } from './ContractDefinitionLoader';
import { Buffer } from 'redstone-isomorphic';
import Transaction from 'arweave/node/lib/transaction';
import { GW_TYPE } from '../InteractionsLoader';
import { ContractDefinition, ContractSource } from '../../../core/ContractDefinition';
import { SmartWeaveTags } from '../../../core/SmartWeaveTags';
import { Benchmark } from '../../../logging/Benchmark';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { ArweaveWrapper } from '../../../utils/ArweaveWrapper';
import { stripTrailingSlash } from '../../../utils/utils';
import { DefinitionLoader } from '../DefinitionLoader';
import { WasmSrc } from './wasm/WasmSrc';
import { WarpEnvironment } from '../../Warp';
import { TagsParser } from './TagsParser';
import { SortKeyCache } from '../../../cache/SortKeyCache';

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
    private cache: SortKeyCache<ContractDefinition<any>>,
    private readonly env: WarpEnvironment
  ) {
    this.baseUrl = stripTrailingSlash(baseUrl);
    this.contractDefinitionLoader = new ContractDefinitionLoader(arweave, env);
    this.arweaveWrapper = new ArweaveWrapper(arweave);
    this.tagsParser = new TagsParser();
  }

  async load<State>(contractTxId: string, evolvedSrcTxId?: string): Promise<ContractDefinition<State>> {
    let cacheKey = contractTxId;
    if (evolvedSrcTxId) {
      cacheKey += `_${evolvedSrcTxId}`;
    }

    const cacheResult = await this.cache.get(cacheKey, 'cd');
    if (cacheResult) {
      this.rLogger.debug('WarpGatewayContractDefinitionLoader: Hit from cache!');
      const result = cacheResult.cachedValue;
      // LevelDB serializes Buffer to an object with 'type' and 'data' fields
      if (result.contractType == 'wasm' && (result.srcBinary as any).data) {
        result.srcBinary = Buffer.from((result.srcBinary as any).data);
      }
      this.verifyEnv(result);
      return result;
    }
    const benchmark = Benchmark.measure();
    const contract = await this.doLoad<State>(contractTxId, evolvedSrcTxId);
    this.rLogger.info(`Contract definition loaded in: ${benchmark.elapsed()}`);
    this.verifyEnv(contract);
    await this.cache.put({ contractTxId: cacheKey, sortKey: 'cd' }, contract);

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

  setCache(cache: SortKeyCache<ContractDefinition<any>>): void {
    this.cache = cache;
  }

  getCache(): SortKeyCache<ContractDefinition<any>> {
    return this.cache;
  }

  private verifyEnv(def: ContractDefinition<unknown>): void {
    if (def.testnet && this.env !== 'testnet') {
      throw new Error('Trying to use testnet contract in a non-testnet env. Use the "forTestnet" factory method.');
    }
    if (!def.testnet && this.env === 'testnet') {
      throw new Error('Trying to use non-testnet contract in a testnet env.');
    }
  }
}
