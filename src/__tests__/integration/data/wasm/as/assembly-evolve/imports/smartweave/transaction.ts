export declare namespace Transaction {
  function id(): string;
  function owner(): string;
  function target(): string;
  function tags(): Tag[];
}

export interface Tag {}
