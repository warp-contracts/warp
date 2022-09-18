import { TransactionStatusResponse } from 'arweave/node/transactions';
import stringify from 'safe-stable-stringify';
import * as crypto from 'crypto';
import Transaction from 'arweave/node/lib/transaction';
import { SortKeyCacheResult } from '../cache/SortKeyCache';
import { ContractCallStack, InteractionCall } from '../core/ContractCallStack';
import { ExecutionContext } from '../core/ExecutionContext';
import {
  InteractionResult,
  HandlerApi,
  ContractInteraction,
  InteractionData
} from '../core/modules/impl/HandlerExecutorFactory';
import { LexicographicalInteractionsSorter } from '../core/modules/impl/LexicographicalInteractionsSorter';
import { InteractionsSorter } from '../core/modules/InteractionsSorter';
import { EvaluationOptions, DefaultEvaluationOptions, EvalStateResult } from '../core/modules/StateEvaluator';
import { SmartWeaveTags } from '../core/SmartWeaveTags';
import { Warp } from '../core/Warp';
import { createInteractionTx, createDummyTx } from '../legacy/create-interaction-tx';
import { GQLNodeInterface } from '../legacy/gqlResult';
import { Benchmark } from '../logging/Benchmark';
import { LoggerFactory } from '../logging/LoggerFactory';
import { Evolve } from '../plugins/Evolve';
import { ArweaveWrapper } from '../utils/ArweaveWrapper';
import { sleep } from '../utils/utils';
import {
  Contract,
  BenchmarkStats,
  SigningFunction,
  CurrentTx,
  WriteInteractionOptions,
  WriteInteractionResponse,
  InnerCallData
} from './Contract';
import { Tags, ArTransfer, emptyTransfer, ArWallet } from './deploy/CreateContract';
import { SourceData, SourceImpl } from './deploy/impl/SourceImpl';
import { InnerWritesEvaluator } from './InnerWritesEvaluator';

/**
 * An implementation of {@link Contract} that is backwards compatible with current style
 * of writing SW contracts (ie. using the "handle" function).
 *
 * It requires {@link ExecutorFactory} that is using {@link HandlerApi} generic type.
 */
export class HandlerBasedContract<State> implements Contract<State> {
  private readonly logger = LoggerFactory.INST.create('HandlerBasedContract');

  private _callStack: ContractCallStack;
  private _evaluationOptions: EvaluationOptions = new DefaultEvaluationOptions();
  private readonly _innerWritesEvaluator = new InnerWritesEvaluator();
  private readonly _callDepth: number;
  private _benchmarkStats: BenchmarkStats = null;
  private readonly _arweaveWrapper: ArweaveWrapper;
  private _sorter: InteractionsSorter;
  private _rootSortKey: string;

  /**
   * wallet connected to this contract
   */
  protected signer?: SigningFunction;

  constructor(
    private readonly _contractTxId: string,
    protected readonly warp: Warp,
    private readonly _parentContract: Contract = null,
    private readonly _innerCallData: InnerCallData = null
  ) {
    this.waitForConfirmation = this.waitForConfirmation.bind(this);
    this._arweaveWrapper = new ArweaveWrapper(warp.arweave);
    this._sorter = new LexicographicalInteractionsSorter(warp.arweave);
    if (_parentContract != null) {
      this._evaluationOptions = _parentContract.evaluationOptions();
      this._callDepth = _parentContract.callDepth() + 1;
      const callingInteraction: InteractionCall = _parentContract
        .getCallStack()
        .getInteraction(_innerCallData.callingInteraction.id);

      if (this._callDepth > this._evaluationOptions.maxCallDepth) {
        throw Error(
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

      const callStack = new ContractCallStack(_contractTxId, this._callDepth, _innerCallData?.callType);
      callingInteraction.interactionInput.foreignContractCalls[_contractTxId] = callStack;
      this._callStack = callStack;
      this._rootSortKey = _parentContract.rootSortKey;
    } else {
      this._callDepth = 0;
      this._callStack = new ContractCallStack(_contractTxId, 0);
      this._rootSortKey = null;
    }

    this.getCallStack = this.getCallStack.bind(this);
  }

  async readState(
    sortKeyOrBlockHeight?: string | number,
    currentTx?: CurrentTx[],
    interactions?: GQLNodeInterface[]
  ): Promise<SortKeyCacheResult<EvalStateResult<State>>> {
    this.logger.info('Read state for', {
      contractTxId: this._contractTxId,
      currentTx,
      sortKeyOrBlockHeight
    });
    const initBenchmark = Benchmark.measure();
    this.maybeResetRootContract();
    if (this._parentContract != null && sortKeyOrBlockHeight == null) {
      throw new Error('SortKey MUST be always set for non-root contract calls');
    }

    const { stateEvaluator } = this.warp;

    const sortKey =
      typeof sortKeyOrBlockHeight == 'number'
        ? this._sorter.generateLastSortKey(sortKeyOrBlockHeight)
        : sortKeyOrBlockHeight;

    const executionContext = await this.createExecutionContext(this._contractTxId, sortKey, false, interactions);
    this.logger.info('Execution Context', {
      srcTxId: executionContext.contractDefinition?.srcTxId,
      missingInteractions: executionContext.sortedInteractions?.length,
      cachedSortKey: executionContext.cachedState?.sortKey
    });
    initBenchmark.stop();

    const stateBenchmark = Benchmark.measure();
    const result = await stateEvaluator.eval(executionContext, currentTx || []);
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

    return result;
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
    this.logger.info(`View state for ${this._contractTxId}`, interactionTx);
    return await this.callContractForTx<Input, View>(input, interactionTx);
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

  async dryWriteFromTx<Input>(
    input: Input,
    transaction: GQLNodeInterface,
    currentTx?: CurrentTx[]
  ): Promise<InteractionResult<State, unknown>> {
    this.logger.info(`Dry-write from transaction ${transaction.id} for ${this._contractTxId}`);
    return await this.callContractForTx<Input>(input, transaction, currentTx || []);
  }

  async writeInteraction<Input>(
    input: Input,
    options?: WriteInteractionOptions
  ): Promise<WriteInteractionResponse | null> {
    this.logger.info('Write interaction', { input, options });
    if (!this.signer) {
      throw new Error("Wallet not connected. Use 'connect' method first.");
    }
    const { arweave, interactionsLoader } = this.warp;

    const effectiveTags = options?.tags || [];
    const effectiveTransfer = options?.transfer || emptyTransfer;
    const effectiveStrict = options?.strict === true;
    const effectiveVrf = options?.vrf === true;
    const effectiveDisableBundling = options?.disableBundling === true;
    const effectiveReward = options?.reward;

    const bundleInteraction = interactionsLoader.type() == 'warp' && !effectiveDisableBundling;

    if (
      bundleInteraction &&
      effectiveTransfer.target != emptyTransfer.target &&
      effectiveTransfer.winstonQty != emptyTransfer.winstonQty
    ) {
      throw new Error('Ar Transfers are not allowed for bundled interactions');
    }

    if (effectiveVrf && !bundleInteraction) {
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
        false,
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

    const response = await fetch(`${this._evaluationOptions.bundlerUrl}gateway/sequencer/register`, {
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
      const handlerResult = await this.callContract(input, undefined, undefined, tags, transfer, strict);

      if (strict && handlerResult.type !== 'ok') {
        throw Error(`Cannot create interaction: ${handlerResult.errorMessage}`);
      }
      const callStack: ContractCallStack = this.getCallStack();
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
    } else {
      if (strict) {
        const handlerResult = await this.callContract(input, undefined, undefined, tags, transfer, strict);
        if (handlerResult.type !== 'ok') {
          throw Error(`Cannot create interaction: ${handlerResult.errorMessage}`);
        }
      }
    }

    if (vrf) {
      tags.push({
        name: SmartWeaveTags.REQUEST_VRF,
        value: 'true'
      });
    }

    const interactionTx = await createInteractionTx(
      this.warp.arweave,
      this.signer,
      this._contractTxId,
      input,
      tags,
      transfer.target,
      transfer.winstonQty,
      bundle,
      reward
    );
    return interactionTx;
  }

  txId(): string {
    return this._contractTxId;
  }

  getCallStack(): ContractCallStack {
    return this._callStack;
  }

  connect(signer: ArWallet | SigningFunction): Contract<State> {
    if (typeof signer == 'function') {
      this.signer = signer;
    } else {
      this.signer = async (tx: Transaction) => {
        await this.warp.arweave.transactions.sign(tx, signer);
      };
    }
    return this;
  }

  setEvaluationOptions(options: Partial<EvaluationOptions>): Contract<State> {
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
    const { definitionLoader, interactionsLoader, executorFactory, stateEvaluator } = this.warp;

    const benchmark = Benchmark.measure();
    const cachedState = await stateEvaluator.latestAvailableState<State>(contractTxId, upToSortKey);

    this.logger.debug('cache lookup', benchmark.elapsed());
    benchmark.reset();

    const evolvedSrcTxId = Evolve.evolvedSrcTxId(cachedState?.cachedValue?.state);
    let handler, contractDefinition, sortedInteractions;

    this.logger.debug('Cached state', cachedState, upToSortKey);

    if (cachedState && cachedState.sortKey == upToSortKey) {
      this.logger.debug('State fully cached, not loading interactions.');
      if (forceDefinitionLoad || evolvedSrcTxId) {
        contractDefinition = await definitionLoader.load<State>(contractTxId, evolvedSrcTxId);
        handler = (await executorFactory.create(contractDefinition, this._evaluationOptions)) as HandlerApi<State>;
      }
    } else {
      [contractDefinition, sortedInteractions] = await Promise.all([
        definitionLoader.load<State>(contractTxId, evolvedSrcTxId),
        interactions
          ? Promise.resolve(interactions)
          : await interactionsLoader.load(
              contractTxId,
              cachedState?.sortKey,
              // (1) we want to eagerly load dependant contract interactions and put them
              // in the interactions' loader cache
              // see: https://github.com/warp-contracts/warp/issues/198
              this.getToSortKey(upToSortKey),
              this._evaluationOptions
            )
      ]);
      // (2) ...but we still need to return only interactions up to original "upToSortKey"
      if (cachedState?.sortKey) {
        sortedInteractions = sortedInteractions.filter((i) => i.sortKey.localeCompare(cachedState?.sortKey) > 0);
      }
      if (upToSortKey) {
        sortedInteractions = sortedInteractions.filter((i) => i.sortKey.localeCompare(upToSortKey) <= 0);
      }
      this.logger.debug('contract and interactions load', benchmark.elapsed());
      if (this._parentContract == null && sortedInteractions.length) {
        // note: if the root contract has zero interactions, it still should be safe
        // - as no other contracts will be called.
        this._rootSortKey = sortedInteractions[sortedInteractions.length - 1].sortKey;
      }
      handler = (await executorFactory.create(contractDefinition, this._evaluationOptions)) as HandlerApi<State>;
    }

    return {
      warp: this.warp,
      contract: this,
      contractDefinition,
      sortedInteractions,
      evaluationOptions: this._evaluationOptions,
      handler,
      cachedState,
      requestedSortKey: upToSortKey
    };
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
    if (this._parentContract == null) {
      this.logger.debug('Clearing call stack for the root contract');
      this._callStack = new ContractCallStack(this.txId(), 0);
      this._rootSortKey = null;
      this.warp.interactionsLoader.clearCache();
    }
  }

  private async callContract<Input, View = unknown>(
    input: Input,
    caller?: string,
    sortKey?: string,
    tags: Tags = [],
    transfer: ArTransfer = emptyTransfer,
    strict = false
  ): Promise<InteractionResult<State, View>> {
    this.logger.info('Call contract input', input);
    this.maybeResetRootContract();
    if (!this.signer) {
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
    } else if (this.signer) {
      const dummyTx = await arweave.createTransaction({
        data: Math.random().toString().slice(-4),
        reward: '72600854',
        last_tx: 'p7vc1iSP6bvH_fCeUFa9LqoV5qiyW-jdEKouAT0XMoSwrNraB9mgpi29Q10waEpO'
      });
      await this.signer(dummyTx);
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
    const evalStateResult = await stateEvaluator.eval<State>(executionContext, []);
    this.logger.info('Current state', evalStateResult.cachedValue.state);

    // create interaction transaction
    const interaction: ContractInteraction<Input> = {
      input,
      caller: executionContext.caller
    };

    this.logger.debug('interaction', interaction);
    const tx = await createInteractionTx(
      arweave,
      this.signer,
      this._contractTxId,
      input,
      tags,
      transfer.target,
      transfer.winstonQty,
      true
    );
    const dummyTx = createDummyTx(tx, executionContext.caller, currentBlockData);

    this.logger.debug('Creating sortKey for', {
      blockId: dummyTx.block.id,
      id: dummyTx.id,
      height: dummyTx.block.height
    });

    dummyTx.sortKey = await this._sorter.createSortKey(dummyTx.block.id, dummyTx.id, dummyTx.block.height, true);
    dummyTx.strict = strict;
    const handleResult = await this.evalInteraction<Input, View>(
      {
        interaction,
        interactionTx: dummyTx,
        currentTx: []
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

  private async callContractForTx<Input, View = unknown>(
    input: Input,
    interactionTx: GQLNodeInterface,
    currentTx?: CurrentTx[]
  ): Promise<InteractionResult<State, View>> {
    this.maybeResetRootContract();

    const executionContext = await this.createExecutionContextFromTx(this._contractTxId, interactionTx);
    const evalStateResult = await this.warp.stateEvaluator.eval<State>(executionContext, currentTx);

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
      interactionTx,
      currentTx
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
    const response = await fetch(
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

  async save(sourceData: SourceData): Promise<any> {
    if (!this.signer) {
      throw new Error("Wallet not connected. Use 'connect' method first.");
    }
    const { arweave } = this.warp;
    const source = new SourceImpl(arweave);

    const srcTx = await source.save(sourceData, this.signer);

    return srcTx.id;
  }

  get rootSortKey(): string {
    return this._rootSortKey;
  }
}
