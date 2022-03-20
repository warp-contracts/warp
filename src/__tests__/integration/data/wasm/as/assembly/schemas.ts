@serializable
export class StateSchema {
  firstName: string;
  lastName: string;
  counter: i32;
}

@serializable
export class ActionSchema {
  function: string;
  contractTxId: string | null;
}

@serializable
export class ResultSchema {
  fullName: string;
}
