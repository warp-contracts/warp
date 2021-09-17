import {
  ArTransfer,
  ArWallet,
  Benchmark,
  Contract,
  ContractInteraction,
  createTx,
  DefaultEvaluationOptions,
  emptyTransfer,
  EvalStateResult,
  EvaluationOptions,
  ExecutionContext,
  HandlerApi,
  InteractionResult,
  InteractionTx,
  LoggerFactory,
  sleep,
  SmartWeave,
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

  /**
   * wallet connected to this contract
   * @protected
   */
  protected wallet?: ArWallet;
  private evaluationOptions: EvaluationOptions = new DefaultEvaluationOptions();

  /**
   * current Arweave networkInfo that will be used for all operations of the SmartWeave protocol.
   * Only the 'root' contract call should read this data from Arweave - all the inner calls ("child" contracts)
   * should reuse this data from the parent ("calling) contract.
   */
  public networkInfo?: NetworkInfoInterface = null;

  constructor(
    readonly contractTxId: string,
    protected readonly smartweave: SmartWeave,
    // note: this will be probably used for creating contract's
    // call hierarchy and generating some sort of "stack trace"
    private readonly callingContract: Contract = null
  ) {
    this.waitForConfirmation = this.waitForConfirmation.bind(this);
    if (callingContract != null) {
      this.networkInfo = (callingContract as HandlerBasedContract<State>).networkInfo;

      // sanity-check...
      if (this.networkInfo == null) {
        throw Error('Calling contract should have the network info already set!');
      }
    }
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

  async readState(
    blockHeight?: number,
    currentTx?: { interactionTxId: string; contractTxId: string }[]
  ): Promise<EvalStateResult<State>> {
    this.logger.info('Read state for', this.contractTxId);
    this.maybeClearNetworkInfo();

    const { stateEvaluator } = this.smartweave;
    const benchmark = Benchmark.measure();
    const executionContext = await this.createExecutionContext(this.contractTxId, blockHeight);
    this.logger.info('Execution Context', {
      blockHeight: executionContext.blockHeight,
      srcTxId: executionContext.contractDefinition.srcTxId
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
    this.maybeClearNetworkInfo();
    if (!this.wallet) {
      this.logger.warn('Wallet not set.');
    }
    const { arweave, stateEvaluator } = this.smartweave;
    // create execution context
    let executionContext = await this.createExecutionContext(this.contractTxId, blockHeight);

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

    this.logger.debug('Creating new interaction for view state');

    // create interaction transaction
    const interaction: ContractInteraction<Input> = {
      input,
      caller: executionContext.caller
    };

    this.logger.trace('interaction', interaction);
    // TODO: what is the best/most efficient way of creating a transaction in this case?
    // creating a real transaction, with multiple calls to Arweave, seems like a huge waste.

    // call one of the contract's view method
    const handleResult = await executionContext.handler.handle<Input, View>(
      executionContext,
      evalStateResult.state,
      interaction,
      {
        id: null,
        recipient: transfer.target,
        owner: {
          address: executionContext.caller
        },
        tags: tags || [],
        fee: null,
        quantity: {
          winston: transfer.winstonQty
        },
        block: executionContext.currentBlockData
      },
      []
    );

    if (handleResult.type !== 'ok') {
      this.logger.fatal('Error while interacting with contract', {
        type: handleResult.type,
        error: handleResult.errorMessage
      });
    }

    return handleResult;
  }

  async viewStateForTx<Input, View>(input: Input, transaction: InteractionTx): Promise<InteractionResult<State, View>> {
    this.logger.info(`Vies state for ${this.contractTxId}`, transaction);
    this.maybeClearNetworkInfo();
    const { stateEvaluator } = this.smartweave;

    const executionContext = await this.createExecutionContextFromTx(this.contractTxId, transaction);
    const evalStateResult = await stateEvaluator.eval<State>(executionContext, []);

    const interaction: ContractInteraction<Input> = {
      input,
      caller: executionContext.caller
    };

    return await executionContext.handler.handle<Input, View>(
      executionContext,
      evalStateResult.state,
      interaction,
      transaction,
      []
    );
  }

  async writeInteraction<Input>(
    input: Input,
    tags: Tags = [],
    transfer: ArTransfer = emptyTransfer
  ): Promise<string | null> {
    if (!this.wallet) {
      throw new Error("Wallet not connected. Use 'connect' method first.");
    }
    this.maybeClearNetworkInfo();
    const { arweave } = this.smartweave;

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
    blockHeight?: number
  ): Promise<ExecutionContext<State, HandlerApi<State>>> {
    const { arweave, definitionLoader, interactionsLoader, interactionsSorter, executorFactory } = this.smartweave;

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
    const [contractDefinition, interactions] = await Promise.all([
      definitionLoader.load<State>(contractTxId),
      // note: "eagerly" loading all of the interactions up to the current
      // network height (instead of the requested "blockHeight").
      // as dumb as it may seem - this in fact significantly speeds up the processing
      // - because the InteractionsLoader (usually CacheableContractInteractionsLoader)
      // doesn't have to download missing interactions during the contract execution
      // (eg. if contract is calling different contracts on different block heights).
      // This basically limits the amount of interactions with Arweave GraphQL endpoint -
      // each such interaction takes at least ~500ms.
      // TODO: this could be further optimized to always load interactions only up to the "root's" call requested height
      interactionsLoader.load(contractTxId, 0, this.networkInfo.height)
    ]);
    this.logger.debug('contract and interactions load', benchmark.elapsed());
    const sortedInteractions = await interactionsSorter.sort(interactions);

    const handler = (await executorFactory.create(contractDefinition)) as HandlerApi<State>;

    return {
      contractDefinition,
      blockHeight,
      interactions,
      sortedInteractions,
      handler,
      smartweave: this.smartweave,
      contract: this,
      evaluationOptions: this.evaluationOptions,
      currentNetworkInfo
    };
  }

  private async createExecutionContextFromTx(
    contractTxId: string,
    transaction: InteractionTx
  ): Promise<ExecutionContext<State, HandlerApi<State>>> {
    const benchmark = Benchmark.measure();
    const { definitionLoader, interactionsLoader, interactionsSorter, executorFactory } = this.smartweave;
    const blockHeight = transaction.block.height;
    const caller = transaction.owner.address;
    const [contractDefinition, interactions] = await Promise.all([
      definitionLoader.load<State>(contractTxId),
      await interactionsLoader.load(contractTxId, 0, blockHeight)
    ]);
    const sortedInteractions = await interactionsSorter.sort(interactions);
    const handler = (await executorFactory.create(contractDefinition)) as HandlerApi<State>;

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
      caller
    };
  }

  private maybeClearNetworkInfo() {
    if (this.callingContract == null) {
      this.logger.debug('Clearing network info for the root contract');
      this.networkInfo = null;
    }
  }

  txId(): string {
    return this.contractTxId;
  }
}
