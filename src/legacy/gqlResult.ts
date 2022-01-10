export interface GQLPageInfoInterface {
  hasNextPage: boolean;
}

export interface GQLOwnerInterface {
  address: string;
  key: string;
}

export interface GQLAmountInterface {
  winston: string;
  ar: string;
}

export interface GQLMetaDataInterface {
  size: number;
  type: string;
}

export interface GQLTagInterface {
  name: string;
  value: string;
}

export interface GQLBlockInterface {
  id: string;
  timestamp: number;
  height: number;
  previous: string;
}

export interface GQLNodeInterface {
  id: string;
  anchor: string;
  signature: string;
  recipient: string;
  owner: GQLOwnerInterface;
  fee: GQLAmountInterface;
  quantity: GQLAmountInterface;
  data: GQLMetaDataInterface;
  tags: GQLTagInterface[];
  block: GQLBlockInterface;
  parent: {
    id: string;
  };
  bundledIn: {
    id: string;
  };
  dry?: boolean;
  sortKey?: string; //added dynamically by the LexicographicalInteractionsSorter
  confirmationStatus?: string;
}

export interface GQLEdgeInterface {
  sortKey?: string;
  cursor: string;
  node: GQLNodeInterface;
}

export interface GQLTransactionsResultInterface {
  pageInfo: GQLPageInfoInterface;
  edges: GQLEdgeInterface[];
}

export interface GQLResultInterface {
  data: {
    transactions: GQLTransactionsResultInterface;
  };
}
