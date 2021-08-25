import { Contract, ContractDefinition, EvaluationOptions, GQLEdgeInterface, SmartWeave } from '@smartweave';
import { NetworkInfoInterface } from 'arweave/node/network';
import { BlockData } from 'arweave/node/blocks';

/**
 * current execution context of the contract - contains all elements
 * that are required to call contract's code.
 * This has been created to prevent some operations to load certain data (eg.
 * contract's definition - which is very time consuming) multiple times
 * (eg. multiple calls to "loadContract" in "interactRead" in the current version of the SW SDK).
 */
export type ExecutionContext<State> = {
  smartweave: SmartWeave;
  contract: Contract<State>;
  contractDefinition: ContractDefinition<State>;
  blockHeight: number;
  interactions: GQLEdgeInterface[];
  sortedInteractions: GQLEdgeInterface[];
  evaluationOptions: EvaluationOptions;
  currentNetworkInfo?: NetworkInfoInterface;
  currentBlockData?: BlockData;
  caller?: string; // note: this is only set for "viewState" operations
};
