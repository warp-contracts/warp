export type ContractError =
  | {
      data: string;
      kind: "RuntimeError";
    }
  | {
      kind: "TransferAmountMustBeHigherThanZero";
    }
  | {
      kind: "TransferFromAndToCannotBeEqual";
    }
  | {
      data: string;
      kind: "TokenNotFound";
    }
  | {
      kind: "IDontLikeThisContract";
    }
  | {
      data: string;
      kind: "OwnerBalanceNotEnough";
    }
  | {
      kind: "OnlyOwnerCanEvolve";
    }
  | {
      kind: "EvolveNotAllowed";
    }
  | {
      kind: "ForbiddenNestedBatch";
    }
  | {
      kind: "CannotMixeReadAndWrite";
    }
  | {
      kind: "EmptyBatch";
    }
  | {
      kind: "UnauthorizedConfiguration";
    }
  | {
      data: string;
      kind: "UnauthorizedAddress";
    }
  | {
      data: string;
      kind: "UnauthorizedTransfer";
    }
  | {
      kind: "TokenAlreadyExists";
    }
  | {
      kind: "ContractIsPaused";
    };
