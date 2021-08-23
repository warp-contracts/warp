import { EvaluationOptions, GQLEdgeInterface, Contract } from '@smartweave';
import { BlockData } from 'arweave/node/blocks';
import { NetworkInfoInterface } from 'arweave/node/network';

/**
 * current execution context of the contract - contains all elements
 * that are required to call contract's code.
 * This has been created to prevent some operations to load certain data (eg.
 * contract's definition - which is very time consuming) multiple times
 * (eg. multiple calls to "loadContract" in "interactRead" in the current version of the SW SDK).
 */
export type ExecutionContext<State = any, Api = any> = {
  contractDefinition: ContractDefinition<State>;
  handler: Api;
  blockHeight: number;
  interactions: GQLEdgeInterface[];
  sortedInteractions: GQLEdgeInterface[];
  client: Contract;
  evaluationOptions: EvaluationOptions;
  currentNetworkInfo?: NetworkInfoInterface;
  currentBlockData?: BlockData;
  caller?: string; // note: this is only set for "viewState" operations
};

/**
 * contains all data and meta-data of the given contact.
 */
export type ContractDefinition<State = any> = {
  txId: string;
  srcTxId: string;
  src: string;
  initState: State;
  minFee: string;
  owner: string;
};
