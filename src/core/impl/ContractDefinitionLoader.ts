import { ContractDefinition, DefinitionLoader, getTag, SmartWeaveTags, SwCache } from '@smartweave';
import Arweave from 'arweave';
import Transaction from 'arweave/web/lib/transaction';

export class ContractDefinitionLoader<State = any> implements DefinitionLoader<State> {
  constructor(
    private readonly arweave: Arweave,
    // TODO: cache should be removed from the core layer and implemented in a wrapper of the core implementation
    private readonly cache?: SwCache<string, ContractDefinition<State>>
  ) {}

  async load(contractTxId: string, forcedSrcTxId?: string): Promise<ContractDefinition<State>> {
    if (!forcedSrcTxId && this.cache?.contains(contractTxId)) {
      console.log('ContractDefinitionLoader: Hit from cache!');
      return Promise.resolve(this.cache?.get(contractTxId));
    }

    const contract = await this.doLoad(contractTxId, forcedSrcTxId);
    this.cache?.put(contractTxId, contract);

    return contract;
  }

  async doLoad(contractTxId: string, forcedSrcTxId?: string): Promise<ContractDefinition<State>> {
    const contractTx = await this.arweave.transactions.get(contractTxId);
    const owner = await this.arweave.wallets.ownerToAddress(contractTx.owner);

    const contractSrcTxId = forcedSrcTxId ? forcedSrcTxId : getTag(contractTx, SmartWeaveTags.CONTRACT_SRC_TX_ID);

    const minFee = getTag(contractTx, SmartWeaveTags.MIN_FEE);
    const contractSrcTx = await this.arweave.transactions.get(contractSrcTxId);
    const src = contractSrcTx.get('data', { decode: true, string: true });

    const initState = JSON.parse(await this.evalInitialState(contractTx));

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
