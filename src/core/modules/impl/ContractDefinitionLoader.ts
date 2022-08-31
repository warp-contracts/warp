import Arweave from 'arweave';
import Transaction from 'arweave/web/lib/transaction';
import { ContractType } from '../../../contract/deploy/CreateContract';
import { WarpCache } from '../../../cache/WarpCache';
import { ContractDefinition, ContractSource } from '../../../core/ContractDefinition';
import { SmartWeaveTags } from '../../../core/SmartWeaveTags';
import { getTag } from '../../../legacy/utils';
import { Benchmark } from '../../../logging/Benchmark';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { ArweaveWrapper } from '../../../utils/ArweaveWrapper';
import { DefinitionLoader } from '../DefinitionLoader';
import { GW_TYPE } from '../InteractionsLoader';
import { WasmSrc } from './wasm/WasmSrc';

const supportedSrcContentTypes = ['application/javascript', 'application/wasm'];

export class ContractDefinitionLoader implements DefinitionLoader {
  private readonly logger = LoggerFactory.INST.create('ContractDefinitionLoader');

  protected arweaveWrapper: ArweaveWrapper;

  constructor(
    private readonly arweave: Arweave,
    // TODO: cache should be removed from the core layer and implemented in a wrapper of the core implementation
    protected readonly cache?: WarpCache<string, ContractDefinition<unknown>>
  ) {
    this.arweaveWrapper = new ArweaveWrapper(arweave);
  }

  async load<State>(contractTxId: string, evolvedSrcTxId?: string): Promise<ContractDefinition<State>> {
    if (!evolvedSrcTxId && this.cache?.contains(contractTxId)) {
      this.logger.debug('ContractDefinitionLoader: Hit from cache!');
      return Promise.resolve(this.cache?.get(contractTxId) as ContractDefinition<State>);
    }
    const benchmark = Benchmark.measure();
    const contract = await this.doLoad<State>(contractTxId, evolvedSrcTxId);
    this.logger.info(`Contract definition loaded in: ${benchmark.elapsed()}`);
    this.cache?.put(contractTxId, contract);

    return contract;
  }

  async doLoad<State>(contractTxId: string, forcedSrcTxId?: string): Promise<ContractDefinition<State>> {
    const benchmark = Benchmark.measure();

    const contractTx = await this.arweaveWrapper.tx(contractTxId);
    const owner = await this.arweave.wallets.ownerToAddress(contractTx.owner);
    this.logger.debug('Contract tx and owner', benchmark.elapsed());
    benchmark.reset();

    const contractSrcTxId = forcedSrcTxId ? forcedSrcTxId : getTag(contractTx, SmartWeaveTags.CONTRACT_SRC_TX_ID);
    const minFee = getTag(contractTx, SmartWeaveTags.MIN_FEE);
    this.logger.debug('Tags decoding', benchmark.elapsed());
    benchmark.reset();
    const s = await this.evalInitialState(contractTx);
    this.logger.debug('init state', s);
    const initState = JSON.parse(await this.evalInitialState(contractTx));
    this.logger.debug('Parsing src and init state', benchmark.elapsed());

    const { src, srcBinary, srcWasmLang, contractType, metadata, srcTx } = await this.loadContractSource(
      contractSrcTxId
    );

    return {
      txId: contractTxId,
      srcTxId: contractSrcTxId,
      src,
      srcBinary,
      srcWasmLang,
      initState,
      minFee,
      owner,
      contractType,
      metadata,
      contractTx: contractTx.toJSON(),
      srcTx
    };
  }

  async loadContractSource(contractSrcTxId: string): Promise<ContractSource> {
    const benchmark = Benchmark.measure();

    const contractSrcTx = await this.arweaveWrapper.tx(contractSrcTxId);
    const srcContentType = getTag(contractSrcTx, SmartWeaveTags.CONTENT_TYPE);
    if (!supportedSrcContentTypes.includes(srcContentType)) {
      throw new Error(`Contract source content type ${srcContentType} not supported`);
    }
    const contractType: ContractType = srcContentType == 'application/javascript' ? 'js' : 'wasm';

    const src =
      contractType == 'js'
        ? await this.arweaveWrapper.txDataString(contractSrcTxId)
        : await this.arweaveWrapper.txData(contractSrcTxId);

    let srcWasmLang;
    let wasmSrc: WasmSrc;
    let srcMetaData;
    if (contractType == 'wasm') {
      wasmSrc = new WasmSrc(src as Buffer);
      srcWasmLang = getTag(contractSrcTx, SmartWeaveTags.WASM_LANG);
      if (!srcWasmLang) {
        throw new Error(`Wasm lang not set for wasm contract src ${contractSrcTxId}`);
      }
      srcMetaData = JSON.parse(getTag(contractSrcTx, SmartWeaveTags.WASM_META));
    }

    this.logger.debug('Contract src tx load', benchmark.elapsed());
    benchmark.reset();

    return {
      src: contractType == 'js' ? (src as string) : null,
      srcBinary: contractType == 'wasm' ? wasmSrc.wasmBinary() : null,
      srcWasmLang,
      contractType,
      metadata: srcMetaData,
      srcTx: contractSrcTx.toJSON()
    };
  }

  private async evalInitialState(contractTx: Transaction): Promise<string> {
    if (getTag(contractTx, SmartWeaveTags.INIT_STATE)) {
      return getTag(contractTx, SmartWeaveTags.INIT_STATE);
    } else if (getTag(contractTx, SmartWeaveTags.INIT_STATE_TX)) {
      const stateTX = getTag(contractTx, SmartWeaveTags.INIT_STATE_TX);
      return this.arweaveWrapper.txDataString(stateTX);
    } else {
      return this.arweaveWrapper.txDataString(contractTx.id);
    }
  }

  type(): GW_TYPE {
    return 'arweave';
  }
}
