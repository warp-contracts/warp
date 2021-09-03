import {
  DefinitionLoader,
  ExecutorFactory,
  HandlerApi,
  InteractionsLoader,
  InteractionsSorter,
  SmartWeaveBuilder,
  StateEvaluator
} from '@smartweave/core';
import Arweave from 'arweave';
import { ArWallet, Contract, HandlerBasedContract } from '@smartweave/contract';
import { JWKInterface } from 'arweave/node/lib/wallet';

/**
 * The SmartWeave "motherboard" ;-).
 * This is the base class that supplies the implementation of the SmartWeave SDK.
 * Allows to plug-in different implementation of all the modules defined in the constructor.
 *
 * After being fully configured, it allows to "connect" to
 * contract and perform operations on them (see {@link Contract})
 */
export class SmartWeave {
  constructor(
    readonly arweave: Arweave,
    readonly definitionLoader: DefinitionLoader,
    readonly interactionsLoader: InteractionsLoader,
    readonly interactionsSorter: InteractionsSorter,
    readonly executorFactory: ExecutorFactory<HandlerApi<unknown>>,
    readonly stateEvaluator: StateEvaluator
  ) {}

  static builder(arweave: Arweave) {
    return new SmartWeaveBuilder(arweave);
  }

  contract<State>(contractTxId: string, callingContract?: Contract): Contract<State> {
    return new HandlerBasedContract<State>(contractTxId, this, callingContract);
  }

  async deploy(wallet: ArWallet) {
    const srcTx = await this.arweave.createTransaction({ data: contractSrc, reward }, wallet);

    srcTx.addTag('App-Name', 'SmartWeaveContractSource');
    srcTx.addTag('App-Version', '0.3.0');
    srcTx.addTag('Content-Type', 'application/javascript');

    await arweave.transactions.sign(srcTx, wallet);

    const response = await arweave.transactions.post(srcTx);

    if (response.status === 200 || response.status === 208) {
      return await createContractFromTx(arweave, wallet, srcTx.id, initState);
    } else {
      throw new Error('Unable to write Contract Source.');
    }
  }

  async  createContractFromTx(
    arweave: Arweave,
    wallet: JWKInterface | 'use_wallet',
    srcTxId: string,
    state: string,
    tags: { name: string; value: string }[] = [],
    target: string = '',
    winstonQty: string = '',
    reward?: string,
  ) {
    let contractTX = await arweave.createTransaction({ data: state, reward }, wallet);

    if (target && winstonQty && target.length && +winstonQty > 0) {
      contractTX = await arweave.createTransaction(
        {
          data: state,
          target: target.toString(),
          quantity: winstonQty.toString(),
          reward,
        },
        wallet,
      );
    }

    if (tags && tags.length) {
      for (const tag of tags) {
        contractTX.addTag(tag.name.toString(), tag.value.toString());
      }
    }
    contractTX.addTag('App-Name', 'SmartWeaveContract');
    contractTX.addTag('App-Version', '0.3.0');
    contractTX.addTag('Contract-Src', srcTxId);
    contractTX.addTag('Content-Type', 'application/json');

    await arweave.transactions.sign(contractTX, wallet);

    const response = await arweave.transactions.post(contractTX);
    if (response.status === 200 || response.status === 208) {
      return contractTX.id;
    } else {
      throw new Error('Unable to write Contract Initial State');
    }
  }
}
