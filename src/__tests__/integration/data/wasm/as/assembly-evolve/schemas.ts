@serializable
export class StateSchema {
  firstName: string;
  lastName: string;
  counter: i32;
  canEvolve: boolean;
  evolve: string;
}

@serializable
export class ActionSchema {
  function: string;
  contractTxId: string | null;
  value: string;
}

@serializable
export class ResultSchema {
  fullName: string;
}
