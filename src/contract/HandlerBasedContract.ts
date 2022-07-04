import {
  ArTransfer,
  ArWallet,
  ArweaveWrapper,
  Benchmark,
  BenchmarkStats,
  Contract,
  ContractCallStack,
  ContractInteraction,
  createDummyTx,
  createInteractionTx,
  CurrentTx,
  DefaultEvaluationOptions,
  emptyTransfer,
  EvalStateResult,
  EvaluationOptions,
  Evolve,
  ExecutionContext,
  GQLNodeInterface,
  HandlerApi,
  InnerWritesEvaluator,
  InteractionCall,
  InteractionData,
  InteractionResult,
  InteractionsSorter,
  LexicographicalInteractionsSorter,
  LoggerFactory,
  SigningFunction,
  sleep,
  SmartWeaveTags,
  SourceData,
  SourceImpl,
  Tags,
  Warp,
  WriteInteractionOptions,
  WriteInteractionResponse
} from '@warp';
import { TransactionStatusResponse } from 'arweave/node/transactions';
import stringify from 'safe-stable-stringify';
import * as crypto from 'crypto';
import Transaction from 'arweave/node/lib/transaction';

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

  /**
   * wallet connected to this contract
   */
  protected signer?: SigningFunction;

  constructor(
    private readonly _contractTxId: string,
    protected readonly warp: Warp,
    private readonly _parentContract: Contract = null,
    private readonly _callingInteraction: GQLNodeInterface = null
  ) {
    this.waitForConfirmation = this.waitForConfirmation.bind(this);
    this._arweaveWrapper = new ArweaveWrapper(warp.arweave);
    this._sorter = new LexicographicalInteractionsSorter(warp.arweave);
    if (_parentContract != null) {
      this._evaluationOptions = _parentContract.evaluationOptions();
      this._callDepth = _parentContract.callDepth() + 1;
      const interaction: InteractionCall = _parentContract.getCallStack().getInteraction(_callingInteraction.id);

      if (this._callDepth > this._evaluationOptions.maxCallDepth) {
        throw Error(
          `Max call depth of ${this._evaluationOptions.maxCallDepth} has been exceeded for interaction ${JSON.stringify(
            interaction.interactionInput
          )}`
        );
      }
      this.logger.debug('Calling interaction id', _callingInteraction.id);
      const callStack = new ContractCallStack(_contractTxId, this._callDepth);
      interaction.interactionInput.foreignContractCalls.set(_contractTxId, callStack);
      this._callStack = callStack;
    } else {
      this._callDepth = 0;
      this._callStack = new ContractCallStack(_contractTxId, 0);
    }
  }

  async readState(sortKeyOrBlockHeight?: string | number, currentTx?: CurrentTx[]): Promise<EvalStateResult<State>> {
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

    const executionContext = await this.createExecutionContext(this._contractTxId, sortKey, false);
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

    return result as EvalStateResult<State>;
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
      const handlerResult = await this.callContract(input, undefined, undefined, tags, transfer);
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
        const handlerResult = await this.callContract(input, undefined, undefined, tags, transfer);
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
    forceDefinitionLoad = false
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
        interactionsLoader.load(contractTxId, cachedState?.sortKey, upToSortKey, this._evaluationOptions)
      ]);
      this.logger.debug('contract and interactions load', benchmark.elapsed());
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
    }
  }

  private async callContract<Input, View = unknown>(
    input: Input,
    caller?: string,
    sortKey?: string,
    tags: Tags = [],
    transfer: ArTransfer = emptyTransfer
  ): Promise<InteractionResult<State, View>> {
    this.logger.info('Call contract input', input);
    this.maybeResetRootContract();
    if (!this.signer) {
      this.logger.warn('Wallet not set.');
    }
    const { arweave, stateEvaluator } = this.warp;
    // create execution context
    let executionContext = await this.createExecutionContext(this._contractTxId, sortKey, true);

    const currentBlockData = await arweave.blocks.getCurrent();

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
    this.logger.info('Current state', evalStateResult.state);

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
    dummyTx.sortKey = await this._sorter.createSortKey(dummyTx.block.id, dummyTx.id, dummyTx.block.height);

    const handleResult = await this.evalInteraction<Input, View>(
      {
        interaction,
        interactionTx: dummyTx,
        currentTx: []
      },
      executionContext,
      evalStateResult
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
      result: evalStateResult.state,
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

    return await this.evalInteraction(interactionData, executionContext, evalStateResult);
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

  async syncState(nodeAddress: string): Promise<Contract> {
    const { stateEvaluator } = this.warp;
    const response = await fetch(`${nodeAddress}/state?id=${this._contractTxId}&validity=true`)
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

  async dumpCache(): Promise<any> {
    const { stateEvaluator } = this.warp;
    return await stateEvaluator.dumpCache();
  }

  get callingInteraction(): GQLNodeInterface | null {
    return this._callingInteraction;
  }
}
