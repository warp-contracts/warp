import stringify from 'safe-stable-stringify';
import * as crypto from 'crypto';
import { SortKeyCacheResult } from '../cache/SortKeyCache';
import { ContractCallRecord, InteractionCall } from '../core/ContractCallRecord';
import { ExecutionContext } from '../core/ExecutionContext';
import {
  ContractInteraction,
  HandlerApi,
  InteractionData,
  InteractionResult
} from '../core/modules/impl/HandlerExecutorFactory';
import { LexicographicalInteractionsSorter } from '../core/modules/impl/LexicographicalInteractionsSorter';
import { InteractionsSorter } from '../core/modules/InteractionsSorter';
import { DefaultEvaluationOptions, EvalStateResult, EvaluationOptions } from '../core/modules/StateEvaluator';
import { SmartWeaveTags } from '../core/SmartWeaveTags';
import { Warp } from '../core/Warp';
import { createDummyTx, createInteractionTx } from '../legacy/create-interaction-tx';
import { GQLNodeInterface } from '../legacy/gqlResult';
import { Benchmark } from '../logging/Benchmark';
import { LoggerFactory } from '../logging/LoggerFactory';
import { Evolve } from '../plugins/Evolve';
import { ArweaveWrapper } from '../utils/ArweaveWrapper';
import { sleep } from '../utils/utils';
import { BenchmarkStats, Contract, InnerCallData, WriteInteractionOptions, WriteInteractionResponse } from './Contract';
import { ArTransfer, ArWallet, emptyTransfer, Tags } from './deploy/CreateContract';
import { InnerWritesEvaluator } from './InnerWritesEvaluator';
import { generateMockVrf } from '../utils/vrf';
import { CustomSignature, Signature } from './Signature';
import { EvaluationOptionsEvaluator } from './EvaluationOptionsEvaluator';
import { WarpFetchWrapper } from '../core/WarpFetchWrapper';
import { Mutex } from 'async-mutex';
import { TransactionStatusResponse } from '../utils/types/arweave-types';

/**
 * An implementation of {@link Contract} that is backwards compatible with current style
 * of writing SW contracts (ie. using the "handle" function).
 *
 * It requires {@link ExecutorFactory} that is using {@link HandlerApi} generic type.
 */
export class HandlerBasedContract<State> implements Contract<State> {
  private readonly logger = LoggerFactory.INST.create('HandlerBasedContract');

  // TODO: refactor: extract execution context logic to a separate class
  private readonly ecLogger = LoggerFactory.INST.create('ExecutionContext');

  private _callStack: ContractCallRecord;
  private _evaluationOptions: EvaluationOptions;
  private _eoEvaluator: EvaluationOptionsEvaluator; // this is set after loading Contract Definition for the root contract
  private readonly _innerWritesEvaluator = new InnerWritesEvaluator();
  private readonly _callDepth: number;
  private _benchmarkStats: BenchmarkStats = null;
  private readonly _arweaveWrapper: ArweaveWrapper;
  private _sorter: InteractionsSorter;
  private _rootSortKey: string;
  private signature: Signature;
  private warpFetchWrapper: WarpFetchWrapper;

  private _children: HandlerBasedContract<any>[] = [];

  private _uncommittedStates = new Map<string, EvalStateResult<unknown>>();

  private readonly mutex = new Mutex();

  constructor(
    private readonly _contractTxId: string,
    protected readonly warp: Warp,
    private readonly _parentContract: Contract<any> = null,
    private readonly _innerCallData: InnerCallData = null
  ) {
    this.waitForConfirmation = this.waitForConfirmation.bind(this);
    this._arweaveWrapper = new ArweaveWrapper(warp.arweave);
    this._sorter = new LexicographicalInteractionsSorter(warp.arweave);
    if (_parentContract != null) {
      this._evaluationOptions = this.getRoot().evaluationOptions();
      if (_parentContract.evaluationOptions().useKVStorage) {
        throw new Error('Foreign writes or reads are forbidden for kv storage contracts');
      }
      this._callDepth = _parentContract.callDepth() + 1;
      const callingInteraction: InteractionCall = _parentContract
        .getCallStack()
        .getInteraction(_innerCallData.callingInteraction.id);

      if (this._callDepth > this._evaluationOptions.maxCallDepth) {
        throw new Error(
          `Max call depth of ${this._evaluationOptions.maxCallDepth} has been exceeded for interaction ${JSON.stringify(
            callingInteraction.interactionInput
          )}`
        );
      }
      this.logger.debug('Calling interaction', {
        id: _innerCallData.callingInteraction.id,
        sortKey: _innerCallData.callingInteraction.sortKey,
        type: _innerCallData.callType
      });

      // if you're reading a state of the contract, on which you've just made a write - you're doing it wrong.
      // the current state of the callee contract is always in the result of an internal write.
      // following is a protection against naughty developers who might be doing such crazy things ;-)
      if (
        callingInteraction.interactionInput?.foreignContractCalls[_contractTxId]?.innerCallType === 'write' &&
        _innerCallData.callType === 'read'
      ) {
        throw new Error(
          'Calling a readContractState after performing an inner write is wrong - instead use a state from the result of an internal write.'
        );
      }

      const callStack = new ContractCallRecord(_contractTxId, this._callDepth, _innerCallData?.callType);
      callingInteraction.interactionInput.foreignContractCalls[_contractTxId] = callStack;
      this._callStack = callStack;
      this._rootSortKey = _parentContract.rootSortKey;
      (_parentContract as HandlerBasedContract<unknown>)._children.push(this);
    } else {
      this._callDepth = 0;
      this._callStack = new ContractCallRecord(_contractTxId, 0);
      this._rootSortKey = null;
      this._evaluationOptions = new DefaultEvaluationOptions();
      this._children = [];
    }

    this.getCallStack = this.getCallStack.bind(this);
    this.warpFetchWrapper = new WarpFetchWrapper(this.warp);
  }

  async readState(
    sortKeyOrBlockHeight?: string | number,
    caller?: string,
    interactions?: GQLNodeInterface[]
  ): Promise<SortKeyCacheResult<EvalStateResult<State>>> {
    this.logger.info('Read state for', {
      contractTxId: this._contractTxId,
      sortKeyOrBlockHeight
    });
    if (!this.isRoot() && sortKeyOrBlockHeight == null) {
      throw new Error('SortKey MUST be always set for non-root contract calls');
    }
    const { stateEvaluator } = this.warp;
    const sortKey =
      typeof sortKeyOrBlockHeight == 'number'
        ? this._sorter.generateLastSortKey(sortKeyOrBlockHeight)
        : sortKeyOrBlockHeight;

    if (sortKey && !this.isRoot() && this.hasUncommittedState(this.txId())) {
      const result = this.getUncommittedState(this.txId());
      return {
        sortKey,
        cachedValue: result as EvalStateResult<State>
      };
    }

    // TODO: not sure if we should synchronize on a contract instance or contractTxId
    // in the latter case, the warp instance should keep a map contractTxId -> mutex
    const releaseMutex = await this.mutex.acquire();
    try {
      const initBenchmark = Benchmark.measure();
      this.maybeResetRootContract();

      const executionContext = await this.createExecutionContext(this._contractTxId, sortKey, false, interactions);
      this.logger.info('Execution Context', {
        srcTxId: executionContext.contractDefinition?.srcTxId,
        missingInteractions: executionContext.sortedInteractions?.length,
        cachedSortKey: executionContext.cachedState?.sortKey
      });
      initBenchmark.stop();

      const stateBenchmark = Benchmark.measure();
      const result = await stateEvaluator.eval(executionContext);
      stateBenchmark.stop();

      const total = (initBenchmark.elapsed(true) as number) + (stateBenchmark.elapsed(true) as number);

      this._benchmarkStats = {
        gatewayCommunication: initBenchmark.elapsed(true) as number,
        stateEvaluation: stateBenchmark.elapsed(true) as number,
        total
      };

      this.logger.info('Benchmark', {
        'Gateway communication  ': initBenchmark.elapsed(),
        'Contract evaluation    ': stateBenchmark.elapsed(),
        'Total:                 ': `${total.toFixed(0)}ms`
      });

      if (sortKey && !this.isRoot()) {
        this.setUncommittedState(this.txId(), result.cachedValue);
      }

      return result;
    } finally {
      releaseMutex();
    }
  }

  async readStateFor(
    sortKey: string,
    interactions: GQLNodeInterface[]
  ): Promise<SortKeyCacheResult<EvalStateResult<State>>> {
    return this.readState(sortKey, undefined, interactions);
  }

  async viewState<Input, View>(
    input: Input,
    tags: Tags = [],
    transfer: ArTransfer = emptyTransfer
  ): Promise<InteractionResult<State, View>> {
    this.logger.info('View state for', this._contractTxId);
    return await this.callContract<Input, View>(input, undefined, undefined, tags, transfer);
  }

  async viewStateForTx<Input, View>(
    input: Input,
    interactionTx: GQLNodeInterface
  ): Promise<InteractionResult<State, View>> {
    this.logger.info(`View state for ${this._contractTxId}`);
    return await this.doApplyInputOnTx<Input, View>(input, interactionTx);
  }

  async dryWrite<Input>(
    input: Input,
    caller?: string,
    tags?: Tags,
    transfer?: ArTransfer
  ): Promise<InteractionResult<State, unknown>> {
    this.logger.info('Dry-write for', this._contractTxId);
    return await this.callContract<Input>(input, caller, undefined, tags, transfer);
  }

  async applyInput<Input>(input: Input, transaction: GQLNodeInterface): Promise<InteractionResult<State, unknown>> {
    this.logger.info(`Apply-input from transaction ${transaction.id} for ${this._contractTxId}`);
    return await this.doApplyInputOnTx<Input>(input, transaction);
  }

  async writeInteraction<Input>(
    input: Input,
    options?: WriteInteractionOptions
  ): Promise<WriteInteractionResponse | null> {
    this.logger.info('Write interaction', { input, options });
    if (!this.signature) {
      throw new Error("Wallet not connected. Use 'connect' method first.");
    }
    const { arweave, interactionsLoader, environment } = this.warp;

    // we're calling this to verify whether proper env is used for this contract
    // (e.g. test env for test contract)
    await this.warp.definitionLoader.load(this._contractTxId);

    const effectiveTags = options?.tags || [];
    const effectiveTransfer = options?.transfer || emptyTransfer;
    const effectiveStrict = options?.strict === true;
    const effectiveVrf = options?.vrf === true;
    const effectiveDisableBundling = options?.disableBundling === true;
    const effectiveReward = options?.reward;

    const bundleInteraction = interactionsLoader.type() == 'warp' && !effectiveDisableBundling;

    this.signature.checkNonArweaveSigningAvailability(bundleInteraction);

    if (
      bundleInteraction &&
      effectiveTransfer.target != emptyTransfer.target &&
      effectiveTransfer.winstonQty != emptyTransfer.winstonQty
    ) {
      throw new Error('Ar Transfers are not allowed for bundled interactions');
    }

    if (effectiveVrf && !bundleInteraction && environment === 'mainnet') {
      throw new Error('Vrf generation is only available for bundle interaction');
    }

    if (bundleInteraction) {
      return await this.bundleInteraction(input, {
        tags: effectiveTags,
        strict: effectiveStrict,
        vrf: effectiveVrf
      });
    } else {
      const interactionTx = await this.createInteraction(
        input,
        effectiveTags,
        effectiveTransfer,
        effectiveStrict,
        false,
        effectiveVrf && environment !== 'mainnet',
        effectiveReward
      );
      const response = await arweave.transactions.post(interactionTx);

      if (response.status !== 200) {
        this.logger.error('Error while posting transaction', response);
        return null;
      }

      if (this._evaluationOptions.waitForConfirmation) {
        this.logger.info('Waiting for confirmation of', interactionTx.id);
        const benchmark = Benchmark.measure();
        await this.waitForConfirmation(interactionTx.id);
        this.logger.info('Transaction confirmed after', benchmark.elapsed());
      }

      if (this.warp.environment == 'local' && this._evaluationOptions.mineArLocalBlocks) {
        await this.warp.testing.mineBlock();
      }

      return { originalTxId: interactionTx.id };
    }
  }

  private async bundleInteraction<Input>(
    input: Input,
    options: {
      tags: Tags;
      strict: boolean;
      vrf: boolean;
    }
  ): Promise<WriteInteractionResponse | null> {
    this.logger.info('Bundle interaction input', input);

    const interactionTx = await this.createInteraction(
      input,
      options.tags,
      emptyTransfer,
      options.strict,
      true,
      options.vrf
    );

    const response = await this.warpFetchWrapper
      .fetch(`${this._evaluationOptions.sequencerUrl}gateway/sequencer/register`, {
        method: 'POST',
        body: JSON.stringify(interactionTx),
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      })
      .then((res) => {
        this.logger.debug(res);
        return res.ok ? res.json() : Promise.reject(res);
      })
      .catch((error) => {
        this.logger.error(error);
        if (error.body?.message) {
          this.logger.error(error.body.message);
        }
        throw new Error(`Unable to bundle interaction: ${JSON.stringify(error)}`);
      });

    return {
      bundlrResponse: response,
      originalTxId: interactionTx.id
    };
  }

  private async createInteraction<Input>(
    input: Input,
    tags: Tags,
    transfer: ArTransfer,
    strict: boolean,
    bundle = false,
    vrf = false,
    reward?: string
  ) {
    if (this._evaluationOptions.internalWrites) {
      // Call contract and verify if there are any internal writes:
      // 1. Evaluate current contract state
      // 2. Apply input as "dry-run" transaction
      // 3. Verify the callStack and search for any "internalWrites" transactions
      // 4. For each found "internalWrite" transaction - generate additional tag:
      // {name: 'InternalWrite', value: callingContractTxId}
      const handlerResult = await this.callContract(input, undefined, undefined, tags, transfer, strict, vrf);

      if (strict && handlerResult.type !== 'ok') {
        throw Error(`Cannot create interaction: ${handlerResult.errorMessage}`);
      }
      const callStack: ContractCallRecord = this.getCallStack();
      const innerWrites = this._innerWritesEvaluator.eval(callStack);
      this.logger.debug('Input', input);
      this.logger.debug('Callstack', callStack.print());

      innerWrites.forEach((contractTxId) => {
        tags.push({
          name: SmartWeaveTags.INTERACT_WRITE,
          value: contractTxId
        });
      });

      this.logger.debug('Tags with inner calls', tags);
    }

    if (vrf) {
      tags.push({
        name: SmartWeaveTags.REQUEST_VRF,
        value: 'true'
      });
    }

    const interactionTx = await createInteractionTx(
      this.warp.arweave,
      this.signature.signer,
      this._contractTxId,
      input,
      tags,
      transfer.target,
      transfer.winstonQty,
      bundle,
      this.warp.environment === 'testnet',
      reward
    );

    if (!this._evaluationOptions.internalWrites && strict) {
      const { arweave } = this.warp;
      const caller =
        this.signature.type == 'arweave'
          ? await arweave.wallets.ownerToAddress(interactionTx.owner)
          : interactionTx.owner;
      const handlerResult = await this.callContract(input, caller, undefined, tags, transfer, strict, vrf);
      if (handlerResult.type !== 'ok') {
        throw Error(`Cannot create interaction: ${handlerResult.errorMessage}`);
      }
    }

    return interactionTx;
  }

  txId(): string {
    return this._contractTxId;
  }

  getCallStack(): ContractCallRecord {
    return this._callStack;
  }

  connect(signature: ArWallet | CustomSignature): Contract<State> {
    this.signature = new Signature(this.warp, signature);
    return this;
  }

  setEvaluationOptions(options: Partial<EvaluationOptions>): Contract<State> {
    if (!this.isRoot()) {
      throw new Error('Evaluation options can be set only for the root contract');
    }
    this._evaluationOptions = {
      ...this._evaluationOptions,
      ...options
    };
    return this;
  }

  private async waitForConfirmation(transactionId: string): Promise<TransactionStatusResponse> {
    const { arweave } = this.warp;

    const status = await arweave.transactions.getStatus(transactionId);

    if (status.confirmed === null) {
      this.logger.info(`Transaction ${transactionId} not yet confirmed. Waiting another 20 seconds before next check.`);
      await sleep(20000);
      await this.waitForConfirmation(transactionId);
    } else {
      this.logger.info(`Transaction ${transactionId} confirmed`, status);
      return status;
    }
  }

  private async createExecutionContext(
    contractTxId: string,
    upToSortKey?: string,
    forceDefinitionLoad = false,
    interactions?: GQLNodeInterface[]
  ): Promise<ExecutionContext<State, HandlerApi<State>>> {
    const { definitionLoader, interactionsLoader, stateEvaluator } = this.warp;

    const benchmark = Benchmark.measure();
    const cachedState = await stateEvaluator.latestAvailableState<State>(contractTxId, upToSortKey);

    this.logger.debug('cache lookup', benchmark.elapsed());
    benchmark.reset();

    const evolvedSrcTxId = Evolve.evolvedSrcTxId(cachedState?.cachedValue?.state);
    let handler, contractDefinition, sortedInteractions, contractEvaluationOptions;

    this.logger.debug('Cached state', cachedState, upToSortKey);

    if (cachedState && cachedState.sortKey == upToSortKey) {
      this.logger.debug('State fully cached, not loading interactions.');
      if (forceDefinitionLoad || evolvedSrcTxId || interactions?.length) {
        contractDefinition = await definitionLoader.load<State>(contractTxId, evolvedSrcTxId);
        if (interactions?.length) {
          sortedInteractions = (await this._sorter.sort(interactions.map((i) => ({ node: i, cursor: null })))).map(
            (i) => i.node
          );
        }
      }
    } else {
      // if we want to apply some 'external' interactions on top of the state cached at given sort key
      // AND we don't have the state cached at the exact requested sort key - throw.
      // NOTE: this feature is used by the D.R.E. nodes.
      if (interactions?.length) {
        throw new Error(`Cannot apply requested interactions at ${upToSortKey}`);
      }

      contractDefinition = await definitionLoader.load<State>(contractTxId, evolvedSrcTxId);
      contractEvaluationOptions = this.resolveEvaluationOptions(contractDefinition.manifest?.evaluationOptions);

      sortedInteractions = interactions
        ? interactions
        : await interactionsLoader.load(
            contractTxId,
            cachedState?.sortKey,
            // (1) we want to eagerly load dependant contract interactions and put them
            // in the interactions' loader cache
            // see: https://github.com/warp-contracts/warp/issues/198
            this.getToSortKey(upToSortKey),
            contractEvaluationOptions
          );

      // (2) ...but we still need to return only interactions up to original "upToSortKey"
      if (cachedState?.sortKey) {
        sortedInteractions = sortedInteractions.filter((i) => i.sortKey.localeCompare(cachedState?.sortKey) > 0);
      }
      if (upToSortKey) {
        sortedInteractions = sortedInteractions.filter((i) => i.sortKey.localeCompare(upToSortKey) <= 0);
      }
      this.logger.debug('contract and interactions load', benchmark.elapsed());
      if (this.isRoot() && sortedInteractions.length) {
        // note: if the root contract has zero interactions, it still should be safe
        // - as no other contracts will be called.
        this._rootSortKey = sortedInteractions[sortedInteractions.length - 1].sortKey;
      }
    }

    if (contractDefinition) {
      if (!contractEvaluationOptions) {
        contractEvaluationOptions = this.resolveEvaluationOptions(contractDefinition.manifest?.evaluationOptions);
      }

      if (!this.isRoot() && contractEvaluationOptions.useKVStorage) {
        throw new Error('Foreign read/writes cannot be performed on kv storage contracts');
      }
      this.ecLogger.debug(`Evaluation options ${contractTxId}:`, contractEvaluationOptions);

      handler = (await this.warp.executorFactory.create(
        contractDefinition,
        contractEvaluationOptions,
        this.warp
      )) as HandlerApi<State>;
    }

    return {
      warp: this.warp,
      contract: this,
      contractDefinition,
      sortedInteractions,
      evaluationOptions: contractEvaluationOptions || this.evaluationOptions(),
      handler,
      cachedState,
      requestedSortKey: upToSortKey
    };
  }

  private resolveEvaluationOptions(rootManifestEvalOptions: EvaluationOptions) {
    if (this.isRoot()) {
      this._eoEvaluator = new EvaluationOptionsEvaluator(this.evaluationOptions(), rootManifestEvalOptions);
      return this._eoEvaluator.rootOptions;
    }
    return this.getRootEoEvaluator().forForeignContract(rootManifestEvalOptions);
  }

  private getToSortKey(upToSortKey?: string) {
    if (this._parentContract?.rootSortKey) {
      if (!upToSortKey) {
        return this._parentContract.rootSortKey;
      }
      return this._parentContract.rootSortKey.localeCompare(upToSortKey) > 0
        ? this._parentContract.rootSortKey
        : upToSortKey;
    } else {
      return upToSortKey;
    }
  }

  private async createExecutionContextFromTx(
    contractTxId: string,
    transaction: GQLNodeInterface
  ): Promise<ExecutionContext<State, HandlerApi<State>>> {
    const caller = transaction.owner.address;
    const sortKey = transaction.sortKey;

    const baseContext = await this.createExecutionContext(contractTxId, sortKey, true);

    return {
      ...baseContext,
      caller
    };
  }

  private maybeResetRootContract() {
    if (this.isRoot()) {
      this.logger.debug('Clearing call stack for the root contract');
      this._callStack = new ContractCallRecord(this.txId(), 0);
      this._rootSortKey = null;
      this.warp.interactionsLoader.clearCache();
      this._children = [];
      this._uncommittedStates = new Map();
    }
  }

  private async callContract<Input, View = unknown>(
    input: Input,
    caller?: string,
    sortKey?: string,
    tags: Tags = [],
    transfer: ArTransfer = emptyTransfer,
    strict = false,
    vrf = false
  ): Promise<InteractionResult<State, View>> {
    this.logger.info('Call contract input', input);
    this.maybeResetRootContract();
    if (!this.signature) {
      this.logger.warn('Wallet not set.');
    }
    const { arweave, stateEvaluator } = this.warp;
    // create execution context
    let executionContext = await this.createExecutionContext(this._contractTxId, sortKey, true);

    const currentBlockData =
      this.warp.environment == 'mainnet' ? await this._arweaveWrapper.warpGwBlock() : await arweave.blocks.getCurrent();

    // add caller info to execution context
    let effectiveCaller;
    if (caller) {
      effectiveCaller = caller;
    } else if (this.signature) {
      // we're creating this transaction just to call the signing function on it
      // - and retrieve the caller/owner
      const dummyTx = await arweave.createTransaction({
        data: Math.random().toString().slice(-4),
        reward: '72600854',
        last_tx: 'p7vc1iSP6bvH_fCeUFa9LqoV5qiyW-jdEKouAT0XMoSwrNraB9mgpi29Q10waEpO'
      });
      await this.signature.signer(dummyTx);
      effectiveCaller = await arweave.wallets.ownerToAddress(dummyTx.owner);
    } else {
      effectiveCaller = '';
    }

    this.logger.info('effectiveCaller', effectiveCaller);
    executionContext = {
      ...executionContext,
      caller: effectiveCaller
    };

    // eval current state
    const evalStateResult = await stateEvaluator.eval<State>(executionContext);
    this.logger.info('Current state', evalStateResult.cachedValue.state);

    // create interaction transaction
    const interaction: ContractInteraction<Input> = {
      input,
      caller: executionContext.caller
    };

    this.logger.debug('interaction', interaction);
    const tx = await createInteractionTx(
      arweave,
      this.signature?.signer,
      this._contractTxId,
      input,
      tags,
      transfer.target,
      transfer.winstonQty,
      true,
      this.warp.environment === 'testnet'
    );
    const dummyTx = createDummyTx(tx, executionContext.caller, currentBlockData);

    this.logger.debug('Creating sortKey for', {
      blockId: dummyTx.block.id,
      id: dummyTx.id,
      height: dummyTx.block.height
    });

    dummyTx.sortKey = await this._sorter.createSortKey(dummyTx.block.id, dummyTx.id, dummyTx.block.height, true);
    dummyTx.strict = strict;
    if (vrf) {
      dummyTx.vrf = generateMockVrf(dummyTx.sortKey, arweave);
    }

    const handleResult = await this.evalInteraction<Input, View>(
      {
        interaction,
        interactionTx: dummyTx
      },
      executionContext,
      evalStateResult.cachedValue
    );

    if (handleResult.type !== 'ok') {
      this.logger.fatal('Error while interacting with contract', {
        type: handleResult.type,
        error: handleResult.errorMessage
      });
    }

    return handleResult;
  }

  private async doApplyInputOnTx<Input, View = unknown>(
    input: Input,
    interactionTx: GQLNodeInterface
  ): Promise<InteractionResult<State, View>> {
    this.maybeResetRootContract();

    let evalStateResult: SortKeyCacheResult<EvalStateResult<State>>;

    const executionContext = await this.createExecutionContextFromTx(this._contractTxId, interactionTx);

    if (!this.isRoot() && this.hasUncommittedState(this.txId())) {
      evalStateResult = {
        sortKey: interactionTx.sortKey,
        cachedValue: this.getUncommittedState(this.txId()) as EvalStateResult<State>
      };
    } else {
      evalStateResult = await this.warp.stateEvaluator.eval<State>(executionContext);
      this.setUncommittedState(this.txId(), evalStateResult.cachedValue);
    }

    this.logger.debug('callContractForTx - evalStateResult', {
      result: evalStateResult.cachedValue.state,
      txId: this._contractTxId
    });

    const interaction: ContractInteraction<Input> = {
      input,
      caller: this._parentContract.txId()
    };

    const interactionData: InteractionData<Input> = {
      interaction,
      interactionTx
    };

    const result = await this.evalInteraction<Input, View>(
      interactionData,
      executionContext,
      evalStateResult.cachedValue
    );
    result.originalValidity = evalStateResult.cachedValue.validity;
    result.originalErrorMessages = evalStateResult.cachedValue.errorMessages;

    return result;
  }

  private async evalInteraction<Input, View = unknown>(
    interactionData: InteractionData<Input>,
    executionContext: ExecutionContext<State, HandlerApi<State>>,
    evalStateResult: EvalStateResult<State>
  ) {
    const interactionCall: InteractionCall = this.getCallStack().addInteractionData(interactionData);
    const benchmark = Benchmark.measure();

    await executionContext.handler.initState(evalStateResult.state);

    const result = await executionContext.handler.handle<Input, View>(
      executionContext,
      evalStateResult,
      interactionData
    );

    interactionCall.update({
      cacheHit: false,
      outputState: this._evaluationOptions.stackTrace.saveState ? result.state : undefined,
      executionTime: benchmark.elapsed(true) as number,
      valid: result.type === 'ok',
      errorMessage: result.errorMessage,
      gasUsed: result.gasUsed
    });

    return result;
  }

  parent(): Contract | null {
    return this._parentContract;
  }

  callDepth(): number {
    return this._callDepth;
  }

  evaluationOptions(): EvaluationOptions {
    return this._evaluationOptions;
  }

  lastReadStateStats(): BenchmarkStats {
    return this._benchmarkStats;
  }

  stateHash(state: State): string {
    const jsonState = stringify(state);

    // note: cannot reuse:
    // "The Hash object can not be used again after hash.digest() method has been called.
    // Multiple calls will cause an error to be thrown."
    const hash = crypto.createHash('sha256');
    hash.update(jsonState);

    return hash.digest('hex');
  }

  async syncState(externalUrl: string, params?: any): Promise<Contract> {
    const { stateEvaluator } = this.warp;
    const response = await this.warpFetchWrapper
      .fetch(
        `${externalUrl}?${new URLSearchParams({
          id: this._contractTxId,
          ...params
        })}`
      )
      .then((res) => {
        return res.ok ? res.json() : Promise.reject(res);
      })
      .catch((error) => {
        if (error.body?.message) {
          this.logger.error(error.body.message);
        }
        throw new Error(`Unable to retrieve state. ${error.status}: ${error.body?.message}`);
      });

    await stateEvaluator.syncState(this._contractTxId, response.sortKey, response.state, response.validity);

    return this;
  }

  async evolve(newSrcTxId: string, options?: WriteInteractionOptions): Promise<WriteInteractionResponse | null> {
    return await this.writeInteraction<any>({ function: 'evolve', value: newSrcTxId }, options);
  }

  get rootSortKey(): string {
    return this._rootSortKey;
  }

  getRootEoEvaluator(): EvaluationOptionsEvaluator {
    const root = this.getRoot() as HandlerBasedContract<unknown>;
    return root._eoEvaluator;
  }

  isRoot(): boolean {
    return this._parentContract == null;
  }

  async getStorageValues(keys: string[]): Promise<SortKeyCacheResult<Map<string, any>>> {
    const lastCached = await this.warp.stateEvaluator.getCache().getLast(this.txId());
    if (lastCached == null) {
      return {
        sortKey: null,
        cachedValue: new Map()
      };
    }

    const storage = this.warp.kvStorageFactory(this.txId());
    const result: Map<string, any> = new Map();
    try {
      await storage.open();
      for (const key of keys) {
        const lastValue = await storage.getLessOrEqual(key, lastCached.sortKey);
        result.set(key, lastValue == null ? null : lastValue.cachedValue);
      }
      return {
        sortKey: lastCached.sortKey,
        cachedValue: result
      };
    } finally {
      await storage.close();
    }
  }

  getUncommittedState(contractTxId: string): EvalStateResult<unknown> {
    return this.getRoot()._uncommittedStates.get(contractTxId);
  }

  setUncommittedState(contractTxId: string, result: EvalStateResult<unknown>): void {
    this.getRoot()._uncommittedStates.set(contractTxId, result);
  }

  hasUncommittedState(contractTxId: string): boolean {
    return this.getRoot()._uncommittedStates.has(contractTxId);
  }

  resetUncommittedState(): void {
    this.getRoot()._uncommittedStates = new Map();
  }

  async commitStates(interaction: GQLNodeInterface): Promise<void> {
    const uncommittedStates = this.getRoot()._uncommittedStates;
    try {
      // i.e. if more than root contract state is in uncommitted state
      // - without this check, we would effectively cache state for each evaluated interaction
      // - which is not storage-effective
      if (uncommittedStates.size > 1) {
        for (const [k, v] of uncommittedStates) {
          await this.warp.stateEvaluator.putInCache(k, interaction, v);
        }
      }
    } finally {
      this.resetUncommittedState();
    }
  }

  private getRoot(): HandlerBasedContract<unknown> {
    let result: Contract = this;
    while (!result.isRoot()) {
      result = result.parent();
    }

    return result as HandlerBasedContract<unknown>;
  }
}
