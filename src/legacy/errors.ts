export const enum WarpErrorType {
  CONTRACT_NOT_FOUND = 'CONTRACT_NOT_FOUND'
}

export class WarpError extends Error {
  public readonly type: WarpErrorType;
  public readonly otherInfo: any;

  constructor(
    type: WarpErrorType,
    optional: {
      message?: string;
      requestedTxId?: string;
    } = {}
  ) {
    if (optional.message) {
      super(optional.message);
    } else {
      super();
    }
    this.type = type;
    this.otherInfo = optional;
  }

  public getType(): WarpErrorType {
    return this.type;
  }
}
