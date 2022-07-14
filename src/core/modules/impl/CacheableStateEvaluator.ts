import { BlockHeightCacheResult, BlockHeightKey, BlockHeightWarpCache } from '@warp/cache';
import {
  DefaultStateEvaluator,
  EvalStateResult,
  ExecutionContext,
  ExecutionContextModifier,
  HandlerApi,
  StateCache
} from '@warp/core';
import Arweave from 'arweave';
import { GQLNodeInterface } from '@warp/legacy';
import { LoggerFactory } from '@warp/logging';
import { CurrentTx } from '@warp/contract';

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
    private readonly cache: BlockHeightWarpCache<StateCache<unknown>>,
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
      executionContext.handler?.initState(cachedState.cachedValue.state);
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
        executionContext.handler?.initState(cachedState.cachedValue.state);
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
    const contractTxId = executionContext.contractDefinition.txId;
    this.cLogger.debug(`onStateEvaluated: cache update for contract ${contractTxId} [${transaction.block.height}]`);

    // this will be problematic if we decide to cache only "onStateEvaluated" and containsInteractionsFromSequencer = true
    // as a workaround, we're now caching every 100 interactions
    await this.putInCache(
      contractTxId,
      transaction,
      state,
      executionContext.blockHeight,
      executionContext.containsInteractionsFromSequencer
    );
    if (!executionContext.evaluationOptions.manualCacheFlush) {
      await this.cache.flush();
    }
  }

  async onStateUpdate<State>(
    transaction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>,
    nthInteraction?: number
  ): Promise<void> {
    if (
      executionContext.evaluationOptions.updateCacheForEachInteraction ||
      executionContext.evaluationOptions.internalWrites ||
      (nthInteraction || 1) % 100 == 0
    ) {
      await this.putInCache(
        executionContext.contractDefinition.txId,
        transaction,
        state,
        executionContext.blockHeight,
        executionContext.containsInteractionsFromSequencer
      );
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
    // TODO: this has been properly fixed in the "leveldb" branch (1.2.0 version)
    // switching off for now here, as in some very rare situations it can cause issues
    // await this.putInCache(executionContext.contractDefinition.txId, transaction, state);
  }

  protected async putInCache<State>(
    contractTxId: string,
    transaction: GQLNodeInterface,
    state: EvalStateResult<State>,
    requestedBlockHeight: number = null,
    containsInteractionsFromSequencer = false
  ): Promise<void> {
    if (transaction.dry) {
      return;
    }
    if (transaction.confirmationStatus !== undefined && transaction.confirmationStatus !== 'confirmed') {
      return;
    }
    // example:
    // requested - 10
    // tx - 9, 10 - caching should be skipped
    const txBlockHeight = transaction.block.height;
    this.cLogger.debug(`requestedBlockHeight: ${requestedBlockHeight}, txBlockHeight: ${txBlockHeight}`);
    if (
      requestedBlockHeight !== null &&
      txBlockHeight >= requestedBlockHeight - 1 &&
      containsInteractionsFromSequencer
    ) {
      this.cLogger.debug(`skipping caching of the last blocks`);
      return;
    }
    const transactionId = transaction.id;
    const stateToCache = new EvalStateResult(state.state, state.validity, transactionId, transaction.block.id);

    await this.cache.put(new BlockHeightKey(contractTxId, txBlockHeight), stateToCache);
  }

  async flushCache(): Promise<void> {
    return await this.cache.flush();
  }

  async syncState(
    contractTxId: string,
    blockHeight: number,
    transactionId: string,
    state: any,
    validity: any
  ): Promise<void> {
    const stateToCache = new EvalStateResult(state, validity, transactionId);
    await this.cache.put(new BlockHeightKey(contractTxId, blockHeight), stateToCache);
  }
}
