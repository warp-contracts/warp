import {
  Benchmark,
  ContractDefinition,
  DefinitionLoader,
  getTag,
  LoggerFactory,
  SmartWeaveTags,
  SwCache
} from '@smartweave';
import Arweave from 'arweave';
import Transaction from 'arweave/web/lib/transaction';

export class ContractDefinitionLoader implements DefinitionLoader {
  private readonly logger = LoggerFactory.INST.create('ContractDefinitionLoader');

  constructor(
    private readonly arweave: Arweave,
    // TODO: cache should be removed from the core layer and implemented in a wrapper of the core implementation
    protected readonly cache?: SwCache<string, ContractDefinition<unknown>>
  ) {}

  async load<State>(contractTxId: string, forcedSrcTxId?: string): Promise<ContractDefinition<State>> {
    if (!forcedSrcTxId && this.cache?.contains(contractTxId)) {
      this.logger.debug('ContractDefinitionLoader: Hit from cache!');
      return Promise.resolve(this.cache?.get(contractTxId) as ContractDefinition<State>);
    }
    const benchmark = Benchmark.measure();
    const contract = await this.doLoad<State>(contractTxId, forcedSrcTxId);
    this.logger.info(`Contract definition loaded in: ${benchmark.elapsed()}`);
    this.cache?.put(contractTxId, contract);

    return contract;
  }

  async doLoad<State>(contractTxId: string, forcedSrcTxId?: string): Promise<ContractDefinition<State>> {
    const benchmark = Benchmark.measure();
    const contractTx = await this.arweave.transactions.get(contractTxId);
    const owner = await this.arweave.wallets.ownerToAddress(contractTx.owner);
    this.logger.debug('Contract tx and owner', benchmark.elapsed());
    benchmark.reset();

    const contractSrcTxId = forcedSrcTxId ? forcedSrcTxId : getTag(contractTx, SmartWeaveTags.CONTRACT_SRC_TX_ID);
    const minFee = getTag(contractTx, SmartWeaveTags.MIN_FEE);
    this.logger.debug('Tags decoding', benchmark.elapsed());
    benchmark.reset();

    const contractSrcTx = await this.arweave.transactions.get(contractSrcTxId);
    this.logger.debug('Contract src tx load', benchmark.elapsed());
    benchmark.reset();

    const src = contractSrcTx.get('data', { decode: true, string: true });
    const initState = JSON.parse(await this.evalInitialState(contractTx));
    this.logger.debug('Parsing src and init state', benchmark.elapsed());

    return {
      txId: contractTxId,
      srcTxId: contractSrcTxId,
      src,
      initState,
      minFee,
      owner
    };
  }

  private async evalInitialState(contractTx: Transaction) {
    if (getTag(contractTx, SmartWeaveTags.INIT_STATE)) {
      return getTag(contractTx, SmartWeaveTags.INIT_STATE);
    } else if (getTag(contractTx, SmartWeaveTags.INIT_STATE_TX)) {
      const stateTX = await this.arweave.transactions.get(getTag(contractTx, SmartWeaveTags.INIT_STATE_TX));
      return stateTX.get('data', { decode: true, string: true });
    } else {
      return contractTx.get('data', { decode: true, string: true });
    }
  }
}
