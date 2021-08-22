import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import {
  ContractInteraction,
  DefaultEvaluationOptions,
  DefinitionLoader,
  EvalStateResult,
  EvaluationOptions,
  ExecutionContext,
  ExecutorFactory,
  HandlerApi,
  InteractionResult,
  InteractionsLoader,
  InteractionsSorter,
  InteractionTx,
  StateEvaluator,
  SwcClient
} from '@smartweave';

/**
 * An implementation of {@link SwcClient} that is backwards compatible with current style
 * of writing SW contracts (ie. using the "handle" function).
 *
 * It requires {@link ExecutorFactory} that is using {@link HandlerApi} generic type.
 */
export class HandlerBasedSwcClient implements SwcClient {
  constructor(
    private readonly arweave: Arweave,
    private readonly definitionLoader: DefinitionLoader,
    private readonly interactionsLoader: InteractionsLoader,
    private readonly executorFactory: ExecutorFactory<any, HandlerApi<any>>,
    private readonly stateEvaluator: StateEvaluator,
    private readonly interactionsSorter: InteractionsSorter
  ) {}

  async readState<State>(
    contractTxId: string,
    blockHeight?: number,
    currentTx?: { interactionTxId: string; contractTxId: string }[],
    evaluationOptions?: EvaluationOptions
  ): Promise<EvalStateResult<State>> {
    console.time('Creating execution context');
    const executionContext = await this.createExecutionContext(contractTxId, blockHeight, evaluationOptions);
    console.timeEnd('Creating execution context');

    const now = Date.now();
    console.time(`\nEvaluating ${contractTxId} state ${now}`);
    const result = await this.stateEvaluator.eval(executionContext, currentTx || []);
    console.timeEnd(`\nEvaluating ${contractTxId} state ${now}`);

    return result;
  }

  async viewState<Input, View>(
    contractTxId: string,
    input: Input,
    wallet: JWKInterface,
    blockHeight?: number,
    evaluationOptions?: EvaluationOptions
  ): Promise<InteractionResult<any, View>> {
    console.time('Creating execution context');
    let executionContext = await this.createExecutionContext(contractTxId, blockHeight, evaluationOptions);
    console.timeEnd('Creating execution context');

    if (!executionContext.currentBlockData) {
      const currentBlockData = executionContext.currentNetworkInfo
        ? // trying to optimise calls to arweave as much as possible...
          await this.arweave.blocks.get(executionContext.currentNetworkInfo.current)
        : await this.arweave.blocks.getCurrent();

      executionContext = {
        ...executionContext,
        currentBlockData
      };
    }

    const caller = await this.arweave.wallets.jwkToAddress(wallet);
    executionContext = {
      ...executionContext,
      caller
    };

    const now = Date.now();
    console.time(`\nEvaluating ${contractTxId} state ${now}`);
    const evalStateResult = await this.stateEvaluator.eval(executionContext, []);
    console.timeEnd(`\nEvaluating ${contractTxId} state ${now}`);

    const interaction: ContractInteraction = {
      input,
      caller: executionContext.caller
    };

    // TODO: what is the best way to create a transaction in this case?
    return await executionContext.handler.handle<Input, View>(
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
  }

  async viewStateForTx<Input, View>(
    contractTxId: string,
    input: Input,
    transaction: InteractionTx,
    evaluationOptions?: EvaluationOptions
  ): Promise<InteractionResult<any, View>> {
    console.time('Creating execution context');
    const executionContext = await this.createExecutionContextFromTx(contractTxId, transaction);
    console.timeEnd('Creating execution context');

    const now = Date.now();
    console.time(`\nEvaluating ${contractTxId} state ${now}`);
    const evalStateResult = await this.stateEvaluator.eval(executionContext, []);
    console.timeEnd(`\nEvaluating ${contractTxId} state ${now}`);

    const interaction: ContractInteraction = {
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

  async writeInteraction<Input>(contractTxId: string, wallet: JWKInterface, input: Input) {
    // TODO: currently it simply routes to the "old" version, but there isn't much to refactor here...
    //return await interactWrite(this.arweave, wallet, contractTxId, input);
  }

  private async createExecutionContext<State = any>(
    contractTxId: string,
    blockHeight?: number,
    evaluationOptions?: EvaluationOptions
  ): Promise<ExecutionContext<State, HandlerApi<State>>> {
    let currentNetworkInfo;

    if (blockHeight == null) {
      // FIXME: this should be done only once for the whole execution!
      // - how to implement this without using some "global", singleton-based provider?
      currentNetworkInfo = await this.arweave.network.getInfo();
      blockHeight = currentNetworkInfo.height;
    }

    if (evaluationOptions == null) {
      evaluationOptions = new DefaultEvaluationOptions();
    }

    const contractDefinition = await this.definitionLoader.load(contractTxId);
    const handler = await this.executorFactory.create(contractDefinition);
    const interactions = await this.interactionsLoader.load(contractTxId, blockHeight);
    const sortedInteractions = await this.interactionsSorter.sort(interactions);

    return {
      contractDefinition,
      handler,
      blockHeight,
      interactions,
      sortedInteractions,
      client: this,
      evaluationOptions,
      currentNetworkInfo
    };
  }

  private async createExecutionContextFromTx<State = any>(
    contractTxId: string,
    transaction: InteractionTx,
    evaluationOptions?: EvaluationOptions
  ): Promise<ExecutionContext<State, HandlerApi<State>>> {
    const blockHeight = transaction.block.height;
    const caller = transaction.owner.address;
    const contractDefinition = await this.definitionLoader.load(contractTxId);
    const handler = await this.executorFactory.create(contractDefinition);
    const interactions = await this.interactionsLoader.load(contractTxId, blockHeight);
    const sortedInteractions = await this.interactionsSorter.sort(interactions);

    if (evaluationOptions == null) {
      evaluationOptions = new DefaultEvaluationOptions();
    }

    return {
      contractDefinition,
      handler,
      blockHeight,
      interactions,
      sortedInteractions,
      client: this,
      evaluationOptions,
      caller
    };
  }
}
