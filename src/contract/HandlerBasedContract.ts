import {
  ArTransfer,
  ArWallet,
  Benchmark,
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
  ExecutionContext,
  GQLNodeInterface,
  HandlerApi,
  InnerWritesEvaluator,
  InteractionCall,
  InteractionData,
  InteractionResult,
  LoggerFactory,
  sleep,
  SmartWeave,
  SmartWeaveTags,
  Tags
} from '@smartweave';
import { TransactionStatusResponse } from 'arweave/node/transactions';
import { NetworkInfoInterface } from 'arweave/node/network';

/**
 * An implementation of {@link Contract} that is backwards compatible with current style
 * of writing SW contracts (ie. using the "handle" function).
 *
 * It requires {@link ExecutorFactory} that is using {@link HandlerApi} generic type.
 */
export class HandlerBasedContract<State> implements Contract<State> {
  private readonly logger = LoggerFactory.INST.create('HandlerBasedContract');

  private callStack: ContractCallStack;
  private evaluationOptions: EvaluationOptions = new DefaultEvaluationOptions();

  /**
   * current Arweave networkInfo that will be used for all operations of the SmartWeave protocol.
   * Only the 'root' contract call should read this data from Arweave - all the inner calls ("child" contracts)
   * should reuse this data from the parent ("calling") contract.
   */
  private networkInfo?: NetworkInfoInterface = null;

  private rootBlockHeight: number = null;

  private readonly innerWritesEvaluator = new InnerWritesEvaluator();

  /**
   * wallet connected to this contract
   */
  protected wallet?: ArWallet;

  constructor(
    readonly contractTxId: string,
    protected readonly smartweave: SmartWeave,
    private readonly callingContract: Contract = null,
    private readonly callingInteraction: GQLNodeInterface = null
  ) {
    this.waitForConfirmation = this.waitForConfirmation.bind(this);
    if (callingContract != null) {
      this.networkInfo = callingContract.getNetworkInfo();
      this.rootBlockHeight = callingContract.getRootBlockHeight();
      // sanity-check...
      if (this.networkInfo == null) {
        throw Error('Calling contract should have the network info already set!');
      }
      this.logger.debug('Calling interaction id', callingInteraction.id);
      const interaction: InteractionCall = callingContract.getCallStack().getInteraction(callingInteraction.id);
      const callStack = new ContractCallStack(contractTxId);
      interaction.interactionInput.foreignContractCalls.set(contractTxId, callStack);
      this.callStack = callStack;
    } else {
      this.callStack = new ContractCallStack(contractTxId);
    }
  }

  async readState(blockHeight?: number, currentTx?: CurrentTx[]): Promise<EvalStateResult<State>> {
    this.logger.info('Read state for', {
      contractTxId: this.contractTxId,
      currentTx
    });
    this.maybeResetRootContract(blockHeight);

    const { stateEvaluator } = this.smartweave;
    const benchmark = Benchmark.measure();
    const executionContext = await this.createExecutionContext(this.contractTxId, blockHeight);
    this.logger.info('Execution Context', {
      blockHeight: executionContext.blockHeight,
      srcTxId: executionContext.contractDefinition?.srcTxId,
      missingInteractions: executionContext.sortedInteractions.length,
      cachedStateHeight: executionContext.cachedState?.cachedHeight
    });
    this.logger.debug('context', benchmark.elapsed());
    benchmark.reset();
    const result = await stateEvaluator.eval(executionContext, currentTx || []);
    this.logger.debug('state', benchmark.elapsed());
    return result as EvalStateResult<State>;
  }

  async viewState<Input, View>(
    input: Input,
    blockHeight?: number,
    tags: Tags = [],
    transfer: ArTransfer = emptyTransfer
  ): Promise<InteractionResult<State, View>> {
    this.logger.info('View state for', this.contractTxId);
    return await this.callContract<Input, View>(input, blockHeight, tags, transfer);
  }

  async viewStateForTx<Input, View>(
    input: Input,
    interactionTx: GQLNodeInterface
  ): Promise<InteractionResult<State, View>> {
    this.logger.info(`View state for ${this.contractTxId}`, interactionTx);
    return await this.callContractForTx<Input, View>(input, interactionTx);
  }

  async dryWrite<Input>(input: Input, tags?: Tags, transfer?: ArTransfer): Promise<InteractionResult<State, unknown>> {
    this.logger.info('Dry-write for', this.contractTxId);
    return await this.callContract<Input>(input, undefined, tags, transfer);
  }

  async dryWriteFromTx<Input>(
    input: Input,
    transaction: GQLNodeInterface,
    currentTx?: CurrentTx[]
  ): Promise<InteractionResult<State, unknown>> {
    this.logger.info(`Dry-write from transaction ${transaction.id} for ${this.contractTxId}`);
    return await this.callContractForTx<Input>(input, transaction, true, currentTx || []);
  }

  async writeInteraction<Input>(
    input: Input,
    tags: Tags = [],
    transfer: ArTransfer = emptyTransfer
  ): Promise<string | null> {
    this.logger.info('Write interaction input', input);
    if (!this.wallet) {
      throw new Error("Wallet not connected. Use 'connect' method first.");
    }
    const { arweave } = this.smartweave;

    await this.callContract(input, undefined, tags, transfer);
    const callStack: ContractCallStack = this.getCallStack();
    const innerWrites = this.innerWritesEvaluator.eval(callStack);
    this.logger.debug('Input', input);
    this.logger.debug('Callstack', callStack.print());

    innerWrites.forEach((contractTxId) => {
      tags.push({
        name: SmartWeaveTags.INTERACT_WRITE,
        value: contractTxId
      });
    });

    this.logger.debug('Tags with inner calls', tags);

    const interactionTx = await createTx(
      this.smartweave.arweave,
      this.wallet,
      this.contractTxId,
      input,
      tags,
      transfer.target,
      transfer.winstonQty
    );

    const response = await arweave.transactions.post(interactionTx);

    if (response.status !== 200) {
      this.logger.error('Error while posting transaction', response);
      return null;
    }

    if (this.evaluationOptions.waitForConfirmation) {
      this.logger.info('Waiting for confirmation of', interactionTx.id);
      const benchmark = Benchmark.measure();
      await this.waitForConfirmation(interactionTx.id);
      this.logger.info('Transaction confirmed after', benchmark.elapsed());
    }
    return interactionTx.id;
  }

  txId(): string {
    return this.contractTxId;
  }

  getCallStack(): ContractCallStack {
    return this.callStack;
  }

  getNetworkInfo(): NetworkInfoInterface {
    return this.networkInfo;
  }

  connect(wallet: ArWallet): Contract<State> {
    this.wallet = wallet;
    return this;
  }

  setEvaluationOptions(options: Partial<EvaluationOptions>): Contract<State> {
    this.evaluationOptions = {
      ...this.evaluationOptions,
      ...options
    };
    return this;
  }

  getRootBlockHeight(): number {
    return this.rootBlockHeight;
  }

  private async waitForConfirmation(transactionId: string): Promise<TransactionStatusResponse> {
    const { arweave } = this.smartweave;

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
    forceDefinitionLoad = false
  ): Promise<ExecutionContext<State, HandlerApi<State>>> {
    const { arweave, definitionLoader, interactionsLoader, interactionsSorter, executorFactory, stateEvaluator } =
      this.smartweave;

    let currentNetworkInfo;

    const benchmark = Benchmark.measure();
    // if this is a "root" call (ie. original call from SmartWeave's client)
    if (this.callingContract == null) {
      this.logger.debug('Reading network info for root call');
      currentNetworkInfo = await arweave.network.getInfo();
      this.networkInfo = currentNetworkInfo;
    } else {
      // if that's a call from within contract's source code
      this.logger.debug('Reusing network info from the calling contract');

      // note: the whole execution tree should use the same network info!
      // this requirement was not fulfilled in the "v1" SDK - each subsequent
      // call to contract (from contract's source code) was loading network info independently
      // if the contract was evaluating for many minutes/hours, this could effectively lead to reading
      // state on different block heights...
      currentNetworkInfo = (this.callingContract as HandlerBasedContract<State>).networkInfo;
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

    let contractDefinition,
      interactions = [],
      sortedInteractions = [],
      handler;
    if (cachedBlockHeight != blockHeight) {
      [contractDefinition, interactions] = await Promise.all([
        definitionLoader.load<State>(contractTxId),
        // note: "eagerly" loading all of the interactions up to the originally requested block height
        // (instead of the blockHeight requested for this specific read state call).
        // as dumb as it may seem - this in fact significantly speeds up the processing
        // - because the InteractionsLoader (usually CacheableContractInteractionsLoader)
        // doesn't have to download missing interactions during the contract execution
        // (eg. if contract is calling different contracts on different block heights).
        // This basically limits the amount of interactions with Arweave GraphQL endpoint -
        // each such interaction takes at least ~500ms.
        interactionsLoader.load(contractTxId, cachedBlockHeight + 1, this.rootBlockHeight || this.networkInfo.height)
      ]);
      this.logger.debug('contract and interactions load', benchmark.elapsed());
      sortedInteractions = await interactionsSorter.sort(interactions);
      handler = (await executorFactory.create(contractDefinition)) as HandlerApi<State>;
    } else {
      this.logger.debug('State fully cached, not loading interactions.');
      if (forceDefinitionLoad) {
        contractDefinition = await definitionLoader.load<State>(contractTxId);
        handler = (await executorFactory.create(contractDefinition)) as HandlerApi<State>;
      }
    }

    return {
      contractDefinition,
      blockHeight,
      interactions,
      sortedInteractions,
      handler,
      smartweave: this.smartweave,
      contract: this,
      evaluationOptions: this.evaluationOptions,
      currentNetworkInfo,
      cachedState
    };
  }

  private async createExecutionContextFromTx(
    contractTxId: string,
    transaction: GQLNodeInterface
  ): Promise<ExecutionContext<State, HandlerApi<State>>> {
    const benchmark = Benchmark.measure();
    const { definitionLoader, interactionsLoader, interactionsSorter, executorFactory, stateEvaluator } =
      this.smartweave;
    const blockHeight = transaction.block.height;
    const caller = transaction.owner.address;

    const cachedState = await stateEvaluator.latestAvailableState<State>(contractTxId, blockHeight);
    let cachedBlockHeight = -1;
    if (cachedState != null) {
      cachedBlockHeight = cachedState.cachedHeight;
    }

    let contractDefinition,
      interactions = [],
      sortedInteractions = [],
      handler;

    if (cachedBlockHeight != blockHeight) {
      [contractDefinition, interactions] = await Promise.all([
        definitionLoader.load<State>(contractTxId),
        await interactionsLoader.load(contractTxId, 0, blockHeight)
      ]);
      sortedInteractions = await interactionsSorter.sort(interactions);
    } else {
      this.logger.debug('State fully cached, not loading interactions.');
      contractDefinition = await definitionLoader.load<State>(contractTxId);
    }
    handler = (await executorFactory.create(contractDefinition)) as HandlerApi<State>;

    this.logger.debug('Creating execution context from tx:', benchmark.elapsed());

    return {
      contractDefinition,
      blockHeight,
      interactions,
      sortedInteractions,
      handler,
      smartweave: this.smartweave,
      contract: this,
      evaluationOptions: this.evaluationOptions,
      caller,
      cachedState
    };
  }

  private maybeResetRootContract(blockHeight?: number) {
    if (this.callingContract == null) {
      this.logger.debug('Clearing network info and call stack for the root contract');
      this.networkInfo = null;
      this.callStack = new ContractCallStack(this.txId());
      this.rootBlockHeight = blockHeight;
    }
  }

  private async callContract<Input, View = unknown>(
    input: Input,
    blockHeight?: number,
    tags: Tags = [],
    transfer: ArTransfer = emptyTransfer
  ): Promise<InteractionResult<State, View>> {
    this.logger.info('Call contract input', input);
    this.maybeResetRootContract();
    if (!this.wallet) {
      this.logger.warn('Wallet not set.');
    }
    const { arweave, stateEvaluator } = this.smartweave;
    // create execution context
    let executionContext = await this.createExecutionContext(this.contractTxId, blockHeight, true);

    // add block data to execution context
    if (!executionContext.currentBlockData) {
      const currentBlockData = executionContext.currentNetworkInfo
        ? // trying to optimise calls to arweave as much as possible...
          await arweave.blocks.get(executionContext.currentNetworkInfo.current)
        : await arweave.blocks.getCurrent();

      executionContext = {
        ...executionContext,
        currentBlockData
      };
    }

    // add caller info to execution context
    const caller = this.wallet ? await arweave.wallets.jwkToAddress(this.wallet) : '';
    executionContext = {
      ...executionContext,
      caller
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
      this.wallet,
      this.contractTxId,
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
    dryWrite = false,
    currentTx?: CurrentTx[]
  ): Promise<InteractionResult<State, View>> {
    this.maybeResetRootContract();

    const executionContext = await this.createExecutionContextFromTx(this.contractTxId, interactionTx);
    const evalStateResult = await this.smartweave.stateEvaluator.eval<State>(executionContext, currentTx);

    this.logger.debug('callContractForTx - evalStateResult', {
      result: evalStateResult.state,
      txId: this.contractTxId
    });

    const interaction: ContractInteraction<Input> = {
      input,
      caller: this.callingContract.txId()//executionContext.caller
    };

    const interactionData: InteractionData<Input> = {
      interaction,
      interactionTx,
      currentTx
    };

    return await this.evalInteraction(interactionData, executionContext, evalStateResult, dryWrite);
  }

  private async evalInteraction<Input, View = unknown>(
    interactionData: InteractionData<Input>,
    executionContext: ExecutionContext<State, HandlerApi<State>>,
    evalStateResult: EvalStateResult<State>,
    dryWrite = false
  ) {
    const interactionCall: InteractionCall = this.getCallStack().addInteractionData(interactionData, dryWrite);

    const benchmark = Benchmark.measure();
    const result = await executionContext.handler.handle<Input, View>(
      executionContext,
      evalStateResult,
      interactionData
    );

    interactionCall.update({
      cacheHit: false,
      intermediaryCacheHit: false,
      outputState: this.evaluationOptions.stackTrace.saveState ? result.state : undefined,
      executionTime: benchmark.elapsed(true) as number,
      valid: result.type === 'ok',
      errorMessage: result.errorMessage
    });

    return result;
  }
}
