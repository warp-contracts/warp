import {
  ArTransfer,
  Benchmark,
  Contract,
  ContractInteraction,
  createTx,
  DefaultEvaluationOptions,
  EvalStateResult,
  EvaluationOptions,
  ExecutionContext,
  HandlerApi,
  InteractionResult,
  InteractionTx,
  LoggerFactory,
  SmartWeave,
  Tags,
  ArWallet,
  emptyTransfer
} from '@smartweave';
import { TransactionStatusResponse } from 'arweave/node/transactions';

const logger = LoggerFactory.INST.create(__filename);

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * An implementation of {@link Contract} that is backwards compatible with current style
 * of writing SW contracts (ie. using the "handle" function).
 *
 * It requires {@link ExecutorFactory} that is using {@link HandlerApi} generic type.
 */
export class HandlerBasedContract<State> implements Contract<State> {
  private wallet?: ArWallet;
  private evaluationOptions: EvaluationOptions = new DefaultEvaluationOptions();

  constructor(
    private readonly contractTxId: string,
    private readonly smartweave: SmartWeave,
    // note: this will be probably used for creating contract's
    // call hierarchy and generating some sort of "stack trace"
    private readonly callingContract: Contract = null
  ) {
    this.waitForConfirmation = this.waitForConfirmation.bind(this);
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
    logger.info('Read state for', this.contractTxId);
    const { stateEvaluator } = this.smartweave;
    const executionContext = await this.createExecutionContext(this.contractTxId, blockHeight);
    const result = await stateEvaluator.eval(executionContext, currentTx || []);
    return result as EvalStateResult<State>;
  }

  // TODO: use tags and transfer params
  async viewState<Input, View>(
    input: Input,
    blockHeight?: number,
    tags: Tags = [],
    transfer: ArTransfer = emptyTransfer
  ): Promise<InteractionResult<State, View>> {
    logger.info('View state for', this.contractTxId);
    if (!this.wallet) {
      logger.warn('Wallet not set.');
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

    logger.debug('Creating new interaction for view state');

    // create interaction transaction
    const interaction: ContractInteraction<Input> = {
      input,
      caller: executionContext.caller
    };

    logger.trace('interaction', interaction);
    // TODO: what is the best/most efficient way of creating a transaction in this case?
    // creating a real transaction, with multiple calls to Arweave, seems like a huge waste.

    // call one of the contract's view method
    const handleResult = await executionContext.handler.handle<Input, View>(
      executionContext,
      evalStateResult.state,
      interaction,
      {
        id: null,
        recipient: null,
        owner: {
          address: executionContext.caller
        },
        tags: tags || [],
        fee: null,
        quantity: null,
        block: executionContext.currentBlockData
      },
      []
    );

    if (handleResult.type !== 'ok') {
      logger.fatal('Error while interacting with contract', {
        type: handleResult.type,
        error: handleResult.errorMessage
      });
    }

    return handleResult;
  }

  async viewStateForTx<Input, View>(input: Input, transaction: InteractionTx): Promise<InteractionResult<State, View>> {
    logger.info(`Vies state for ${this.contractTxId}`, transaction);
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

  // TODO: this basically calls previous version, to be refactored.
  async writeInteraction<Input>(
    input: Input,
    tags: Tags = [],
    transfer: ArTransfer = emptyTransfer
  ): Promise<string | null> {
    if (!this.wallet) {
      throw new Error("Wallet not connected. Use 'connect' method first.");
    }
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
      logger.error('Error while posting transaction', response);
      return null;
    }

    if (this.evaluationOptions.waitForConfirmation) {
      logger.info('Waiting for confirmation of', interactionTx.id);
      const benchmark = Benchmark.measure();
      await this.waitForConfirmation(interactionTx.id);
      logger.info('Transaction confirmed after', benchmark.elapsed());
    }
    return interactionTx.id;
  }

  private async waitForConfirmation(transactionId: string): Promise<TransactionStatusResponse> {
    const { arweave } = this.smartweave;

    const status = await arweave.transactions.getStatus(transactionId);

    if (status.confirmed === null) {
      logger.info(`Transaction ${transactionId} not yet confirmed. Waiting another 20 seconds before next check.`);
      await sleep(20000);
      await this.waitForConfirmation(transactionId);
    } else {
      logger.info(`Transaction ${transactionId} confirmed`, status);
      return status;
    }
  }

  private async createExecutionContext(
    contractTxId: string,
    blockHeight?: number
  ): Promise<ExecutionContext<State, HandlerApi<State>>> {
    const benchmark = Benchmark.measure();
    const { arweave, definitionLoader, interactionsLoader, interactionsSorter, executorFactory } = this.smartweave;

    let currentNetworkInfo;

    if (blockHeight == null) {
      // FIXME: this should be done only once for the whole execution!
      // - how to implement this without using some "global", singleton-based provider?
      currentNetworkInfo = await arweave.network.getInfo();
      blockHeight = currentNetworkInfo.height;
    }

    const contractDefinition = await definitionLoader.load<State>(contractTxId);
    const interactions = await interactionsLoader.load(contractTxId, blockHeight);
    const sortedInteractions = await interactionsSorter.sort(interactions);
    const handler = (await executorFactory.create(contractDefinition)) as HandlerApi<State>;

    logger.debug('Creating execution context:', benchmark.elapsed());

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
    const contractDefinition = await definitionLoader.load<State>(contractTxId);
    const interactions = await interactionsLoader.load(contractTxId, blockHeight);
    const sortedInteractions = await interactionsSorter.sort(interactions);
    const handler = (await executorFactory.create(contractDefinition)) as HandlerApi<State>;

    logger.debug('Creating execution context from tx:', benchmark.elapsed());

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
}
