import { BlockHeightCacheResult, BlockHeightKey, BlockHeightSwCache } from '@smartweave/cache';
import {
  DefaultStateEvaluator,
  EvalStateResult,
  ExecutionContext,
  ExecutionContextModifier,
  HandlerApi,
  StateCache
} from '@smartweave/core';
import Arweave from 'arweave';
import { GQLNodeInterface } from '@smartweave/legacy';
import { LoggerFactory } from '@smartweave/logging';
import { CurrentTx } from '@smartweave/contract';

/**
 * An implementation of DefaultStateEvaluator that adds caching capabilities.
 *
 * The main responsibility of this class is to compute whether there are
 * any interaction transactions, for which the state hasn't been evaluated yet -
 * if so - it generates a list of such transactions and evaluates the state
 * for them - taking as an input state the last cached state.
 */
export class CacheableStateEvaluator extends DefaultStateEvaluator {
  private readonly cLogger = LoggerFactory.INST.create('CacheableStateEvaluator');

  constructor(
    arweave: Arweave,
    private readonly cache: BlockHeightSwCache<StateCache<unknown>>,
    executionContextModifiers: ExecutionContextModifier[] = []
  ) {
    super(arweave, executionContextModifiers);
  }

  async eval<State>(
    executionContext: ExecutionContext<State, HandlerApi<State>>,
    currentTx: CurrentTx[]
  ): Promise<EvalStateResult<State>> {
    const requestedBlockHeight = executionContext.blockHeight;
    this.cLogger.debug(`Requested state block height: ${requestedBlockHeight}`);

    const cachedState = executionContext.cachedState;
    if (cachedState?.cachedHeight === requestedBlockHeight) {
      return cachedState.cachedValue;
    }

    this.cLogger.debug('executionContext.sortedInteractions', executionContext.sortedInteractions.length);

    const sortedInteractionsUpToBlock = executionContext.sortedInteractions.filter((tx) => {
      return tx.node.block.height <= executionContext.blockHeight;
    });

    let missingInteractions = sortedInteractionsUpToBlock.slice();

    this.cLogger.debug('missingInteractions', missingInteractions.length);

    // if there was anything to cache...
    if (sortedInteractionsUpToBlock.length > 0) {
      if (cachedState != null) {
        this.cLogger.debug(`Cached state for ${executionContext.contractDefinition.txId}`, {
          cachedHeight: cachedState.cachedHeight,
          requestedBlockHeight
        });

        // verify if for the requested block height there are any interactions
        // with higher block height than latest value stored in cache - basically if there are any non-cached interactions.
        missingInteractions = sortedInteractionsUpToBlock.filter(
          ({ node }) => node.block.height > cachedState.cachedHeight && node.block.height <= requestedBlockHeight
        );
      }

      this.cLogger.debug(`Interactions until [${requestedBlockHeight}]`, {
        total: sortedInteractionsUpToBlock.length,
        cached: sortedInteractionsUpToBlock.length - missingInteractions.length
      });

      // TODO: this is tricky part, needs proper description
      // for now: it prevents from infinite loop calls between calls that are making
      // internal interact writes.
      for (const entry of currentTx || []) {
        if (entry.contractTxId === executionContext.contractDefinition.txId) {
          const index = missingInteractions.findIndex((tx) => tx.node.id === entry.interactionTxId);
          if (index !== -1) {
            this.cLogger.debug('Inf. Loop fix - removing interaction', {
              height: missingInteractions[index].node.block.height,
              contractTxId: entry.contractTxId,
              interactionTxId: entry.interactionTxId
            });
            missingInteractions.splice(index);
          }
        }
      }

      // if cache is up-to date - return immediately to speed-up the whole process
      if (missingInteractions.length === 0 && cachedState) {
        this.cLogger.debug(`State up to requested height [${requestedBlockHeight}] fully cached!`);
        return cachedState.cachedValue;
      }
    }

    const baseState =
      cachedState == null ? executionContext.contractDefinition.initState : cachedState.cachedValue.state;
    const baseValidity = cachedState == null ? {} : cachedState.cachedValue.validity;

    // eval state for the missing transactions - starting from latest value from cache.
    return await this.doReadState(
      missingInteractions,
      new EvalStateResult(baseState, baseValidity),
      executionContext,
      currentTx
    );
  }

  async onStateEvaluated<State>(
    transaction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>
  ): Promise<void> {
    if (transaction.dry) {
      return;
    }
    const contractTxId = executionContext.contractDefinition.txId;

    this.cLogger.debug(`onStateEvaluated: cache update for contract ${contractTxId} [${transaction.block.height}]`);
    await this.putInCache(contractTxId, transaction, state);
    await this.cache.flush();
  }

  async onStateUpdate<State>(
    transaction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>
  ): Promise<void> {
    if (executionContext.evaluationOptions.updateCacheForEachInteraction) {
      await this.putInCache(executionContext.contractDefinition.txId, transaction, state);
    }
  }

  async latestAvailableState<State>(
    contractTxId: string,
    blockHeight: number
  ): Promise<BlockHeightCacheResult<EvalStateResult<State>> | null> {
    this.cLogger.debug('Searching for', { contractTxId, blockHeight });
    const stateCache = (await this.cache.getLessOrEqual(contractTxId, blockHeight)) as BlockHeightCacheResult<
      StateCache<State>
    >;

    this.cLogger.debug('Latest available state at', stateCache?.cachedHeight);

    if (stateCache == null) {
      return null;
    }

    return new BlockHeightCacheResult<EvalStateResult<State>>(stateCache.cachedHeight, stateCache.cachedValue);
  }

  async onInternalWriteStateUpdate<State>(
    transaction: GQLNodeInterface,
    contractTxId: string,
    state: EvalStateResult<State>
  ): Promise<void> {
    this.cLogger.debug('Internal write state update:', {
      height: transaction.block.height,
      contractTxId,
      state
    });
    await this.putInCache(contractTxId, transaction, state);
  }

  async onContractCall<State>(
    transaction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>
  ): Promise<void> {
    //FIXME: https://github.com/redstone-finance/redstone-smartcontracts/issues/53
    //await this.putInCache(executionContext.contractDefinition.txId, transaction, state);
  }

  protected async putInCache<State>(
    contractTxId: string,
    transaction: GQLNodeInterface,
    state: EvalStateResult<State>
  ): Promise<void> {
    if (transaction.dry) {
      return;
    }
    const transactionId = transaction.id;
    const blockHeight = transaction.block.height;
    const stateToCache = new EvalStateResult(state.state, state.validity, transactionId, transaction.block.id);

    await this.cache.put(new BlockHeightKey(contractTxId, blockHeight), stateToCache);
  }
}
