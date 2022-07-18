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
  createTx,
  CurrentTx,
  DefaultEvaluationOptions,
  emptyTransfer,
  EvalStateResult,
  EvaluationOptions,
  Evolve,
  ExecutionContext,
  GQLEdgeInterface,
  GQLNodeInterface,
  HandlerApi,
  InnerWritesEvaluator,
  InteractionCall,
  InteractionData,
  InteractionResult,
  LoggerFactory,
  SigningFunction,
  sleep,
  Warp,
  SmartWeaveTags,
  SourceType,
  Tags,
  SourceImpl,
  SourceData,
  BundleInteractionResponse
} from '@warp';
import { TransactionStatusResponse } from 'arweave/node/transactions';
import { NetworkInfoInterface } from 'arweave/node/network';
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

  /**
   * current Arweave networkInfo that will be used for all operations of the SmartWeave protocol.
   * Only the 'root' contract call should read this data from Arweave - all the inner calls ("child" contracts)
   * should reuse this data from the parent ("calling") contract.
   */
  private _networkInfo?: Partial<NetworkInfoInterface> = null;

  private _rootBlockHeight: number = null;

  private readonly _innerWritesEvaluator = new InnerWritesEvaluator();

  private readonly _callDepth: number;

  private _benchmarkStats: BenchmarkStats = null;

  private readonly _arweaveWrapper: ArweaveWrapper;

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
    if (_parentContract != null) {
      this._networkInfo = _parentContract.getNetworkInfo();
      this._rootBlockHeight = _parentContract.getRootBlockHeight();
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
      // sanity-check...
      if (this._networkInfo == null) {
        throw Error('Calling contract should have the network info already set!');
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

  async readState(blockHeight?: number, currentTx?: CurrentTx[]): Promise<EvalStateResult<State>> {
    return this.readStateSequencer(blockHeight, undefined, currentTx);
  }

  async readStateSequencer(
    blockHeight: number,
    upToTransactionId: string,
    currentTx?: CurrentTx[]
  ): Promise<EvalStateResult<State>> {
    this.logger.info('Read state for', {
      contractTxId: this._contractTxId,
      currentTx
    });
    const initBenchmark = Benchmark.measure();
    this.maybeResetRootContract(blockHeight);

    const { stateEvaluator } = this.warp;
    const executionContext = await this.createExecutionContext(
      this._contractTxId,
      blockHeight,
      false,
      upToTransactionId
    );
    this.logger.info('Execution Context', {
      blockHeight: executionContext.blockHeight,
      srcTxId: executionContext.contractDefinition?.srcTxId,
      missingInteractions: executionContext.sortedInteractions.length,
      cachedStateHeight: executionContext.cachedState?.cachedHeight,
      upToTransactionId
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
    blockHeight?: number,
    tags: Tags = [],
    transfer: ArTransfer = emptyTransfer
  ): Promise<InteractionResult<State, View>> {
    this.logger.info('View state for', this._contractTxId);
    return await this.callContract<Input, View>(input, undefined, blockHeight, tags, transfer);
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
    tags: Tags = [],
    transfer: ArTransfer = emptyTransfer,
    strict = false
  ): Promise<string | null> {
    this.logger.info('Write interaction input', input);
    if (!this.signer) {
      throw new Error("Wallet not connected. Use 'connect' method first.");
    }
    const { arweave } = this.warp;

    const interactionTx = await this.createInteraction(input, tags, transfer, strict);
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
    return interactionTx.id;
  }

  async bundleInteraction<Input>(
    input: Input,
    options: {
      tags: Tags;
      strict: boolean;
      vrf: boolean;
    } = {
      tags: [],
      strict: false,
      vrf: false
    }
  ): Promise<BundleInteractionResponse | null> {
    this.logger.info('Bundle interaction input', input);
    if (!this.signer) {
      throw new Error("Wallet not connected. Use 'connect' method first.");
    }

    options = {
      tags: [],
      strict: false,
      vrf: false,
      ...options
    };

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
    vrf = false
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

    const interactionTx = await createTx(
      this.warp.arweave,
      this.signer,
      this._contractTxId,
      input,
      tags,
      transfer.target,
      transfer.winstonQty,
      bundle
    );
    return interactionTx;
  }

  txId(): string {
    return this._contractTxId;
  }

  getCallStack(): ContractCallStack {
    return this._callStack;
  }

  getNetworkInfo(): Partial<NetworkInfoInterface> {
    return this._networkInfo;
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

  getRootBlockHeight(): number {
    return this._rootBlockHeight;
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
    blockHeight?: number,
    forceDefinitionLoad = false,
    upToTransactionId: string = undefined
  ): Promise<ExecutionContext<State, HandlerApi<State>>> {
    const { definitionLoader, interactionsLoader, interactionsSorter, executorFactory, stateEvaluator, useWarpGwInfo } =
      this.warp;

    let currentNetworkInfo;

    const benchmark = Benchmark.measure();
    // if this is a "root" call (ie. original call from Warp's client)
    if (this._parentContract == null) {
      if (blockHeight) {
        this._networkInfo = {
          height: blockHeight
        };
      } else {
        this.logger.debug('Reading network info for root call');
        currentNetworkInfo = useWarpGwInfo ? await this._arweaveWrapper.rGwInfo() : await this._arweaveWrapper.info();
        this._networkInfo = currentNetworkInfo;
      }
    } else {
      // if that's a call from within contract's source code
      this.logger.debug('Reusing network info from the calling contract');

      // note: the whole execution tree should use the same network info!
      // this requirement was not fulfilled in the "v1" SDK - each subsequent
      // call to contract (from contract's source code) was loading network info independently
      // if the contract was evaluating for many minutes/hours, this could effectively lead to reading
      // state on different block heights...
      currentNetworkInfo = (this._parentContract as HandlerBasedContract<State>)._networkInfo;
    }

    if (blockHeight == null) {
      blockHeight = currentNetworkInfo.height;
    }
    this.logger.debug('network info', benchmark.elapsed());
    benchmark.reset();

    const cachedState = await stateEvaluator.latestAvailableState<State>(contractTxId, blockHeight);
    let cachedBlockHeight = -1;
    if (cachedState != null) {
      cachedBlockHeight = cachedState.cachedHeight;
    }

    this.logger.debug('cache lookup', benchmark.elapsed());
    benchmark.reset();

    const evolvedSrcTxId = Evolve.evolvedSrcTxId(cachedState?.cachedValue?.state);

    let contractDefinition,
      interactions: GQLEdgeInterface[] = [],
      sortedInteractions: GQLEdgeInterface[] = [],
      handler;
    if (cachedBlockHeight != blockHeight) {
      [contractDefinition, interactions] = await Promise.all([
        definitionLoader.load<State>(contractTxId, evolvedSrcTxId),
        // note: "eagerly" loading all of the interactions up to the originally requested block height
        // (instead of the blockHeight requested for this specific read state call).
        // as dumb as it may seem - this in fact significantly speeds up the processing
        // - because the InteractionsLoader (usually CacheableContractInteractionsLoader)
        // doesn't have to download missing interactions during the contract execution
        // (eg. if contract is calling different contracts on different block heights).
        // This basically limits the amount of interactions with Arweave GraphQL endpoint -
        // each such interaction takes at least ~500ms.
        interactionsLoader.load(
          contractTxId,
          cachedBlockHeight + 1,
          this._rootBlockHeight || this._networkInfo.height,
          this._evaluationOptions,
          upToTransactionId
        )
      ]);
      this.logger.debug('contract and interactions load', benchmark.elapsed());
      sortedInteractions = await interactionsSorter.sort(interactions);
      this.logger.trace('Sorted interactions', sortedInteractions);
      handler = (await executorFactory.create(contractDefinition, this._evaluationOptions)) as HandlerApi<State>;
    } else {
      this.logger.debug('State fully cached, not loading interactions.');
      if (forceDefinitionLoad || evolvedSrcTxId) {
        contractDefinition = await definitionLoader.load<State>(contractTxId, evolvedSrcTxId);
        handler = (await executorFactory.create(contractDefinition, this._evaluationOptions)) as HandlerApi<State>;
      }
    }

    const containsInteractionsFromSequencer = interactions.some((i) => i.node.source == SourceType.WARP_SEQUENCER);
    this.logger.debug('containsInteractionsFromSequencer', containsInteractionsFromSequencer);

    return {
      contractDefinition,
      blockHeight,
      sortedInteractions,
      handler,
      warp: this.warp,
      contract: this,
      evaluationOptions: this._evaluationOptions,
      currentNetworkInfo,
      cachedState,
      containsInteractionsFromSequencer,
      upToTransactionId
    };
  }

  private async createExecutionContextFromTx(
    contractTxId: string,
    transaction: GQLNodeInterface
  ): Promise<ExecutionContext<State, HandlerApi<State>>> {
    const benchmark = Benchmark.measure();
    const { definitionLoader, interactionsLoader, interactionsSorter, executorFactory, stateEvaluator } = this.warp;
    const blockHeight = transaction.block.height;
    const caller = transaction.owner.address;

    const cachedState = await stateEvaluator.latestAvailableState<State>(contractTxId, blockHeight);
    let cachedBlockHeight = -1;
    if (cachedState != null) {
      cachedBlockHeight = cachedState.cachedHeight;
    }

    let contractDefinition,
      interactions = [],
      sortedInteractions = [];

    if (cachedBlockHeight != blockHeight) {
      [contractDefinition, interactions] = await Promise.all([
        definitionLoader.load<State>(contractTxId),
        await interactionsLoader.load(contractTxId, 0, blockHeight, this._evaluationOptions)
      ]);
      sortedInteractions = await interactionsSorter.sort(interactions);
    } else {
      this.logger.debug('State fully cached, not loading interactions.');
      contractDefinition = await definitionLoader.load<State>(contractTxId);
    }
    const handler = (await executorFactory.create(contractDefinition, this._evaluationOptions)) as HandlerApi<State>;

    this.logger.debug('Creating execution context from tx:', benchmark.elapsed());

    const containsInteractionsFromSequencer = interactions.some((i) => i.node.source == SourceType.WARP_SEQUENCER);

    return {
      contractDefinition,
      blockHeight,
      sortedInteractions,
      handler,
      warp: this.warp,
      contract: this,
      evaluationOptions: this._evaluationOptions,
      caller,
      cachedState,
      containsInteractionsFromSequencer
    };
  }

  private maybeResetRootContract(blockHeight?: number) {
    if (this._parentContract == null) {
      this.logger.debug('Clearing network info and call stack for the root contract');
      this._networkInfo = null;
      this._callStack = new ContractCallStack(this.txId(), 0);
      this._rootBlockHeight = blockHeight;
    }
  }

  private async callContract<Input, View = unknown>(
    input: Input,
    caller?: string,
    blockHeight?: number,
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
    let executionContext = await this.createExecutionContext(this._contractTxId, blockHeight, true);

    // add block data to execution context
    if (!executionContext.currentBlockData) {
      const currentBlockData = executionContext.currentNetworkInfo?.current
        ? // trying to optimise calls to arweave as much as possible...
          await arweave.blocks.get(executionContext.currentNetworkInfo.current)
        : await arweave.blocks.getCurrent();

      executionContext = {
        ...executionContext,
        currentBlockData
      };
    }

    // add caller info to execution context
    let effectiveCaller;
    if (caller) {
      effectiveCaller = caller;
    } else if (this.signer) {
      const dummyTx = await arweave.createTransaction({ data: Math.random().toString().slice(-4) });
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

    // create interaction transaction
    const interaction: ContractInteraction<Input> = {
      input,
      caller: executionContext.caller
    };

    this.logger.debug('interaction', interaction);
    const tx = await createTx(
      arweave,
      this.signer,
      this._contractTxId,
      input,
      tags,
      transfer.target,
      transfer.winstonQty
    );
    const dummyTx = createDummyTx(tx, executionContext.caller, executionContext.currentBlockData);

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

    const result = await this.evalInteraction<Input, View>(interactionData, executionContext, evalStateResult);
    result.originalValidity = evalStateResult.validity;

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
      intermediaryCacheHit: false,
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

    await stateEvaluator.syncState(
      this._contractTxId,
      response.height,
      response.lastTransactionId,
      response.state,
      response.validity
    );

    return this;
  }

  async evolve(newSrcTxId: string, useBundler = false): Promise<string | BundleInteractionResponse | null> {
    if (useBundler) {
      return await this.bundleInteraction<any>({ function: 'evolve', value: newSrcTxId });
    } else {
      return await this.writeInteraction<any>({ function: 'evolve', value: newSrcTxId });
    }
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
}
