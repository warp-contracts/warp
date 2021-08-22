/**
 * Holds all the info we need about an interaction Tx.
 */
import { GQLTagInterface } from './gqlResult';

export interface InteractionTx {
  id: string;
  recipient: string;
  owner: Owner;
  tags: GQLTagInterface[];
  fee: Amount;
  quantity: Amount;
  block: Block;
}

interface Block {
  height: number;
  id?: string;
  timestamp: number;
}

interface Owner {
  address: string;
}

interface Amount {
  winston: string;
}
