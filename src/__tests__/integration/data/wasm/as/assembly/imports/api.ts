export type ContractFn<S, A, R> = (state: S, action: A) => HandlerResultSchema<S, R>;

@serializable
export class HandlerResultSchema<S, R> {
  state: S | null;
  result: R | null;
}

@serializable
export class SmartWeaveSchema {
  contract: ContractSchema;
  block: BlockSchema;
  transaction: TransactionSchema;
}

@serializable
export class BlockSchema {
  height: i32;
  indep_hash: string;
  timestamp: i32;
}

@serializable
export class TransactionSchema {
  id: string;
  owner: string;
  target: string;
}

@serializable
export class ContractSchema {
  id: string;
  owner: string;
}
