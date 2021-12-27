import { BlockHeightCacheResult, CurrentTx, ExecutionContext, GQLNodeInterface } from '@smartweave';

/**
 * Implementors of this class are responsible for evaluating contract's state
 * - based on the {@link ExecutionContext}.
 */
export interface StateEvaluator {
  eval<State>(executionContext: ExecutionContext<State>, currentTx: CurrentTx[]): Promise<EvalStateResult<State>>;

  /**
   * a hook that is called on each state update (i.e. after evaluating state for each interaction transaction)
   */
  onStateUpdate<State>(
    transaction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>
  ): Promise<void>;

  /**
   * a hook that is called after state has been fully evaluated
   */
  onStateEvaluated<State>(
    transaction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>
  ): Promise<void>;

  /**
   * a hook that is called after performing internal write between contracts
   */
  onInternalWriteStateUpdate<State>(
    transaction: GQLNodeInterface,
    contractTxId: string,
    state: EvalStateResult<State>
  ): Promise<void>;

  /**
   * a hook that is called before communicating with other contract.
   * note to myself: putting values into cache only "onContractCall" may degrade performance.
   * For example:
   * 1. block 722317 - contract A calls B
   * 2. block 722727 - contract A calls B
   * 3. block 722695 - contract B calls A
   * If we update cache only on contract call - for the last above call (B->A)
   * we would retrieve state cached for 722317. If there are any transactions
   * between 722317 and 722695 - the performance will be degraded.
   */
  onContractCall<State>(
    transaction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>
  ): Promise<void>;

  /**
   * loads latest available state for given contract for given blockHeight.
   * - implementors should be aware that there might multiple interactions
   * for single block - and sort them according to protocol specification.
   */
  latestAvailableState<State>(
    contractTxId: string,
    blockHeight: number
  ): Promise<BlockHeightCacheResult<EvalStateResult<State>> | null>;
}

export class EvalStateResult<State> {
  constructor(
    readonly state: State,
    readonly validity: Record<string, boolean>,
    readonly transactionId?: string,
    readonly blockId?: string
  ) {}
}

export class DefaultEvaluationOptions implements EvaluationOptions {
  // default = true - still cannot decide whether true or false should be the default.
  // "false" may lead to some fairly simple attacks on contract, if the contract
  // does not properly validate input data.
  // "true" may lead to wrongly calculated state, even without noticing the problem
  // (eg. when using unsafe client and Arweave does not respond properly for a while)
  ignoreExceptions = true;

  waitForConfirmation = false;

  updateCacheForEachInteraction = true;

  internalWrites = false;

  maxCallDepth = 7; // your lucky number...

  maxInteractionEvaluationTimeSeconds = 60;

  stackTrace = {
    saveState: false
  };
}

// an interface for the contract EvaluationOptions - can be used to change the behaviour of some of the features.
export interface EvaluationOptions {
  // whether exceptions from given transaction interaction should be ignored
  ignoreExceptions: boolean;

  // allow to wait for confirmation of the interaction transaction - this way
  // you will know, when the new interaction is effectively available on the network
  waitForConfirmation: boolean;

  // whether cache should be updated after evaluating each interaction transaction.
  // this can be switched off to speed up cache writes (ie. for some contracts (with flat structure)
  // and caches it maybe more suitable to cache only after state has been fully evaluated)
  // NOTE: currently safe for contracts that don't make any reads from other contracts
  // (eg. basic PSTs, community contracts, etc.)
  // If used with contracts that make reads from other contracts - may cause issues with state evaluation
  // - eg contracts: w27141UQGgrCFhkiw9tL7A0-qWMQjbapU3mq2TfI4Cg, 38TR3D8BxlPTc89NOW67IkQQUPR8jDLaJNdYv-4wWfM
  // https://github.com/redstone-finance/redstone-smartcontracts/issues/53
  updateCacheForEachInteraction: boolean;

  // a new, experimental enhancement of the protocol that allows for interactWrites from
  // smart contract's source code.
  internalWrites: boolean;

  // the maximum call depth between contracts
  // eg. ContractA calls ContractB,
  // then ContractB calls ContractC,
  // then ContractC calls ContractD
  // - call depth = 3
  // this is added as a protection from "stackoverflow" errors
  maxCallDepth: number;

  // the maximum evaluation time of a single interaction transaction
  maxInteractionEvaluationTimeSeconds: number;

  // a set of options that control the behaviour of the stack trace generator
  stackTrace: {
    // whether output state should be saved for each interaction in the stack trace (may result in huuuuge json files!)
    saveState: boolean;
  };
}
