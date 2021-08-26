import { JWKInterface } from 'arweave/node/lib/wallet';
import {
  Benchmark,
  Contract,
  ContractInteraction,
  DefaultEvaluationOptions,
  EvalStateResult,
  EvaluationOptions,
  ExecutionContext,
  ExecutorFactory,
  HandlerApi,
  InteractionResult,
  InteractionTx,
  LoggerFactory,
  SmartWeave
} from '@smartweave';

const logger = LoggerFactory.INST.create(__filename);

/**
 * An implementation of {@link Contract} that is backwards compatible with current style
 * of writing SW contracts (ie. using the "handle" function).
 *
 * It requires {@link ExecutorFactory} that is using {@link HandlerApi} generic type.
 */
export class HandlerBasedContract<State> implements Contract<State> {
  private wallet?: JWKInterface;

  constructor(
    private readonly contractTxId: string,
    private readonly smartweave: SmartWeave,
    // note: this will be probably used for creating contract's
    // call hierarchy and generating some sort of "stack trace"
    private readonly callingContract: Contract = null
  ) {}

  async readState(
    blockHeight?: number,
    currentTx?: { interactionTxId: string; contractTxId: string }[],
    evaluationOptions?: EvaluationOptions
  ): Promise<EvalStateResult<State>> {
    logger.info('Read state for', this.contractTxId);
    const { stateEvaluator } = this.smartweave;
    const executionContext = await this.createExecutionContext(this.contractTxId, blockHeight, evaluationOptions);

    const result = await stateEvaluator.eval(executionContext, currentTx || []);
    return result as EvalStateResult<State>;
  }

  async viewState<Input, View>(
    input: Input,
    blockHeight?: number,
    evaluationOptions?: EvaluationOptions
  ): Promise<InteractionResult<State, View>> {
    if (!this.wallet) {
      throw new Error("Wallet not connected. Use 'connect' method first.");
    }

    logger.info('View state for', this.contractTxId);
    const { arweave, stateEvaluator } = this.smartweave;
    let executionContext = await this.createExecutionContext(this.contractTxId, blockHeight, evaluationOptions);

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

    const caller = await arweave.wallets.jwkToAddress(this.wallet);
    executionContext = {
      ...executionContext,
      caller
    };

    const evalStateResult = await stateEvaluator.eval(executionContext, []);

    logger.debug('Creating new intraction for view state');

    const interaction: ContractInteraction<Input> = {
      input,
      caller: executionContext.caller
    };

    logger.trace('interaction', interaction);

    const handler = (await this.smartweave.executorFactory.create(
      executionContext.contractDefinition
    )) as HandlerApi<State>;

    // TODO: what is the best way to create a transaction in this case?
    const handleResult = await handler.handle<Input, View>(
      executionContext,
      evalStateResult.state,
      interaction,
      {
        id: null,
        recipient: null,
        owner: {
          address: executionContext.caller
        },
        tags: [],
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

  async viewStateForTx<Input, View>(
    input: Input,
    transaction: InteractionTx,
    evaluationOptions?: EvaluationOptions
  ): Promise<InteractionResult<State, View>> {
    logger.info(`Vies state for ${this.contractTxId}`, transaction);
    const { stateEvaluator } = this.smartweave;

    const executionContext = await this.createExecutionContextFromTx(this.contractTxId, transaction);
    const evalStateResult = await stateEvaluator.eval(executionContext, []);

    const interaction: ContractInteraction<Input> = {
      input,
      caller: executionContext.caller
    };

    const handler = (await this.smartweave.executorFactory.create(
      executionContext.contractDefinition
    )) as HandlerApi<State>;

    return await handler.handle<Input, View>(executionContext, evalStateResult.state, interaction, transaction, []);
  }

  async writeInteraction<Input>(input: Input) {
    // TODO: currently it simply routes to the "old" version, but there isn't much to refactor here...
    //return await interactWrite(this.arweave, wallet, contractTxId, input);
  }

  private async createExecutionContext(
    contractTxId: string,
    blockHeight?: number,
    evaluationOptions?: EvaluationOptions
  ): Promise<ExecutionContext<State>> {
    const benchmark = Benchmark.measure();
    const { arweave, definitionLoader, interactionsLoader, interactionsSorter } = this.smartweave;

    let currentNetworkInfo;

    if (blockHeight == null) {
      // FIXME: this should be done only once for the whole execution!
      // - how to implement this without using some "global", singleton-based provider?
      currentNetworkInfo = await arweave.network.getInfo();
      blockHeight = currentNetworkInfo.height;
    }

    if (evaluationOptions == null) {
      evaluationOptions = new DefaultEvaluationOptions();
    }

    const contractDefinition = await definitionLoader.load<State>(contractTxId);
    const interactions = await interactionsLoader.load(contractTxId, blockHeight);
    const sortedInteractions = await interactionsSorter.sort(interactions);

    logger.debug('Creating execution context:', benchmark.elapsed());

    return {
      contractDefinition,
      blockHeight,
      interactions,
      sortedInteractions,
      smartweave: this.smartweave,
      contract: this,
      evaluationOptions,
      currentNetworkInfo
    };
  }

  private async createExecutionContextFromTx(
    contractTxId: string,
    transaction: InteractionTx,
    evaluationOptions?: EvaluationOptions
  ): Promise<ExecutionContext<State>> {
    const benchmark = Benchmark.measure();
    const { definitionLoader, interactionsLoader, interactionsSorter } = this.smartweave;
    const blockHeight = transaction.block.height;
    const caller = transaction.owner.address;
    const contractDefinition = await definitionLoader.load<State>(contractTxId);
    const interactions = await interactionsLoader.load(contractTxId, blockHeight);
    const sortedInteractions = await interactionsSorter.sort(interactions);

    if (evaluationOptions == null) {
      evaluationOptions = new DefaultEvaluationOptions();
    }
    logger.debug('Creating execution context from tx:', benchmark.elapsed());

    return {
      contractDefinition,
      blockHeight,
      interactions,
      sortedInteractions,
      smartweave: this.smartweave,
      contract: this,
      evaluationOptions,
      caller
    };
  }

  connect(wallet: JWKInterface): Contract<State> {
    this.wallet = wallet;
    return this;
  }
}
