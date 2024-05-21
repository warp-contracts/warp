import Arweave from 'arweave';
import { ArweaveContractDefinitionLoader } from './ArweaveContractDefinitionLoader';
import { Buffer } from 'warp-isomorphic';
import { GW_TYPE } from '../InteractionsLoader';
import { ContractDefinition, ContractSource } from '../../../core/ContractDefinition';
import { WARP_TAGS } from '../../KnownTags';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { ArweaveWrapper } from '../../../utils/ArweaveWrapper';
import { DefinitionLoader } from '../DefinitionLoader';
import { WasmSrc } from './wasm/WasmSrc';
import { Warp, WarpEnvironment } from '../../Warp';
import { TagsParser } from './TagsParser';
import { Transaction } from '../../../utils/types/arweave-types';
import { getJsonResponse, stripTrailingSlash } from '../../../utils/utils';
import { WarpFetchWrapper } from '../../../core/WarpFetchWrapper';

/**
 * Makes use of Warp Gateway ({@link https://github.com/redstone-finance/redstone-sw-gateway})
 * to load Contract Data.
 *
 * If the contract data is not available on Warp Gateway - it fallbacks to default implementation
 * in {@link ArweaveContractDefinitionLoader} - i.e. loads the definition from Arweave gateway.
 */
export class WarpGatewayContractDefinitionLoader implements DefinitionLoader {
  private readonly rLogger = LoggerFactory.INST.create('WarpGatewayContractDefinitionLoader');
  private contractDefinitionLoader: ArweaveContractDefinitionLoader;
  private arweaveWrapper: ArweaveWrapper;
  private readonly tagsParser: TagsParser;
  private _warp: Warp;
  private _warpFetchWrapper: WarpFetchWrapper;

  constructor(arweave: Arweave, env: WarpEnvironment) {
    this.contractDefinitionLoader = new ArweaveContractDefinitionLoader(arweave, env);
    this.tagsParser = new TagsParser();
  }

  async load<State>(contractTxId: string, evolvedSrcTxId?: string): Promise<ContractDefinition<State>> {
    try {
      const baseUrl = stripTrailingSlash(this._warp.gwUrl());
      const result: ContractDefinition<State> = await getJsonResponse(
        this._warpFetchWrapper.fetch(
          `${baseUrl}/gateway/contract?txId=${contractTxId}${evolvedSrcTxId ? `&srcTxId=${evolvedSrcTxId}` : ''}`
        )
      );

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
        const srcMetaData = JSON.parse(this.tagsParser.getTag(sourceTx, WARP_TAGS.WASM_META));
        result.metadata = srcMetaData;
      }
      result.contractType = result.src ? 'js' : 'wasm';
      return result;
    } catch (e) {
      this.rLogger.warn('Falling back to default contracts loader', e);
      return await this.contractDefinitionLoader.doLoad(contractTxId, evolvedSrcTxId);
    }
  }

  async loadContractSource(contractSrcTxId: string): Promise<ContractSource> {
    return await this.contractDefinitionLoader.loadContractSource(contractSrcTxId);
  }

  type(): GW_TYPE {
    return 'warp';
  }

  set warp(warp: Warp) {
    this._warp = warp;
    this.arweaveWrapper = new ArweaveWrapper(warp);
    this.contractDefinitionLoader.warp = warp;
    this._warpFetchWrapper = new WarpFetchWrapper(warp);
  }
}
