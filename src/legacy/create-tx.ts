import Arweave from 'arweave';
import { ArWallet, GQLNodeInterface } from '@smartweave';
import Transaction from 'arweave/node/lib/transaction';
import { CreateTransactionInterface } from 'arweave/node/common';
import { BlockData } from 'arweave/node/blocks';

export async function createTx(
  arweave: Arweave,
  wallet: ArWallet,
  contractId: string,
  input: any,
  tags: { name: string; value: string }[],
  target = '',
  winstonQty = '0'
): Promise<Transaction> {
  const options: Partial<CreateTransactionInterface> = {
    data: Math.random().toString().slice(-4)
  };

  if (target && target.length) {
    options.target = target.toString();
    if (winstonQty && +winstonQty > 0) {
      options.quantity = winstonQty.toString();
    }
  }

  const interactionTx = await arweave.createTransaction(options, wallet);

  if (!input) {
    throw new Error(`Input should be a truthy value: ${JSON.stringify(input)}`);
  }

  if (tags && tags.length) {
    for (const tag of tags) {
      interactionTx.addTag(tag.name.toString(), tag.value.toString());
    }
  }
  interactionTx.addTag('App-Name', 'SmartWeaveAction');
  // use real SDK version here?
  interactionTx.addTag('App-Version', '0.3.0');
  interactionTx.addTag('Contract', contractId);
  interactionTx.addTag('Input', JSON.stringify(input));

  await arweave.transactions.sign(interactionTx, wallet);
  return interactionTx;
}

export function createDummyTx(tx: Transaction, from: string, block: BlockData): GQLNodeInterface {
  return {
    id: tx.id,
    owner: {
      address: from,
      key: ''
    },
    recipient: tx.target,
    tags: tx.tags,
    fee: {
      winston: tx.reward,
      ar: ''
    },
    quantity: {
      winston: tx.quantity,
      ar: ''
    },
    block: {
      id: block.indep_hash,
      height: block.height,
      timestamp: block.timestamp,
      previous: null
    },
    // note: calls within dry runs cannot be cached (per block - like the state cache)!
    // that's super important, as the block height used for
    // the dry-run is the current network block height
    // - and not the block height of the real transaction that
    // will be mined on Arweave.
    // If we start caching results of the dry-runs, we can completely fuck-up
    // the consecutive state evaluations.
    // - that's why we're setting "dry" flag to true here
    // - this prevents the caching layer from saving
    // the state evaluated for such interaction in cache.
    dry: true,
    anchor: null,
    signature: null,
    data: null,
    parent: null
  };
}

export function unpackTags(tx: Transaction): Record<string, string | string[]> {
  const tags = tx.get('tags') as any;
  const result: Record<string, string | string[]> = {};

  for (const tag of tags) {
    try {
      const name = tag.get('name', { decode: true, string: true }) as string;
      const value = tag.get('value', { decode: true, string: true }) as string;
      if (!Object.prototype.hasOwnProperty.call(result, name)) {
        result[name] = value;
        continue;
      }
      result[name] = [...result[name], value];
    } catch (e) {
      // ignore tags with invalid utf-8 strings in key or value.
    }
  }
  return result;
}
