import Arweave from 'arweave';
import { ArWallet } from '@smartweave';
import Transaction from 'arweave/node/lib/transaction';
import { CreateTransactionInterface } from 'arweave/node/common';

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
