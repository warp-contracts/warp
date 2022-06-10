import { SortKeyCacheResult, SortKeySwCache, StateCacheKey } from '@smartweave/cache';
import {
  DefaultStateEvaluator,
  EvalStateResult,
  ExecutionContext,
  ExecutionContextModifier,
  HandlerApi
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
    private readonly cache: SortKeySwCache<EvalStateResult<unknown>>,
    executionContextModifiers: ExecutionContextModifier[] = []
  ) {
    super(arweave, executionContextModifiers);
  }

  async eval<State>(
    executionContext: ExecutionContext<State, HandlerApi<State>>,
    currentTx: CurrentTx[]
  ): Promise<EvalStateResult<State>> {
    const cachedState = executionContext.cachedState;
    if (cachedState && cachedState.sortKey == executionContext.requestedSortKey) {
      this.cLogger.info(`Exact cache hit for sortKey ${cachedState.sortKey}`);
      executionContext.handler?.initState(cachedState.cachedValue.state);
      return cachedState.cachedValue;
    }

    const missingInteractions = executionContext.sortedInteractions;

    // TODO: this is tricky part, needs proper description
    // for now: it prevents from infinite loop calls between calls that are making
    // internal interact writes.
    const contractTxId = executionContext.contractDefinition.txId;
    // sanity check...
    if (!contractTxId) {
      throw new Error('Contract tx id not set in the execution context');
    }
    for (const entry of currentTx || []) {
      if (entry.contractTxId === executionContext.contractDefinition.txId) {
        const index = missingInteractions.findIndex((tx) => tx.id === entry.interactionTxId);
        if (index !== -1) {
          this.cLogger.debug('Inf. Loop fix - removing interaction', {
            height: missingInteractions[index].block.height,
            contractTxId: entry.contractTxId,
            interactionTxId: entry.interactionTxId
          });
          missingInteractions.splice(index);
        }
      }
    }

    if (missingInteractions.length == 0) {
      this.cLogger.info(`No missing interactions`);
      if (cachedState) {
        executionContext.handler?.initState(cachedState.cachedValue.state);
        return cachedState.cachedValue;
      } else {
        executionContext.handler?.initState(executionContext.contractDefinition.initState);
        return new EvalStateResult(executionContext.contractDefinition.initState, {}, {});
      }
    }

    const baseState =
      cachedState == null ? executionContext.contractDefinition.initState : cachedState.cachedValue.state;

    const baseValidity = cachedState == null ? {} : cachedState.cachedValue.validity;
    const baseErrorMessages = cachedState == null ? {} : cachedState.cachedValue.errorMessages;

    // eval state for the missing transactions - starting from the latest value from cache.
    return await this.doReadState(
      missingInteractions,
      new EvalStateResult(baseState, baseValidity, baseErrorMessages || {}),
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
    await this.putInCache(contractTxId, transaction, state);
  }

  async onStateUpdate<State>(
    transaction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>,
    nthInteraction?: number
  ): Promise<void> {
    if (
      executionContext.evaluationOptions.updateCacheForEachInteraction ||
      executionContext.evaluationOptions.internalWrites /*||
      (nthInteraction || 1) % 100 == 0*/
    ) {
      await this.putInCache(executionContext.contractDefinition.txId, transaction, state);
    }
  }

  async latestAvailableState<State>(
    contractTxId: string,
    sortKey?: string
  ): Promise<SortKeyCacheResult<EvalStateResult<State>> | null> {
    this.cLogger.debug('Searching for', { contractTxId, sortKey });
    if (sortKey) {
      const stateCache = (await this.cache.getLessOrEqual(contractTxId, sortKey)) as SortKeyCacheResult<
        EvalStateResult<State>
      >;
      if (stateCache) {
        this.cLogger.debug('Latest available state at', stateCache.sortKey);
      }
      return stateCache;
    } else {
      return (await this.cache.getLast(contractTxId)) as SortKeyCacheResult<EvalStateResult<State>>;
    }
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
    if (executionContext.sortedInteractions?.length == 0) {
      return;
    }
    const txIndex = executionContext.sortedInteractions.indexOf(transaction);
    const prevIndex = Math.max(0, txIndex - 1);
    await this.putInCache(
      executionContext.contractDefinition.txId,
      executionContext.sortedInteractions[prevIndex],
      state
    );
  }

  public async putInCache<State>(
    contractTxId: string,
    transaction: GQLNodeInterface,
    state: EvalStateResult<State>
  ): Promise<void> {
    if (transaction.dry) {
      return;
    }
    if (transaction.confirmationStatus !== undefined && transaction.confirmationStatus !== 'confirmed') {
      return;
    }
    const stateToCache = new EvalStateResult(state.state, state.validity, state.errorMessages || {});

    this.cLogger.debug('Putting into cache', {
      contractTxId,
      transaction: transaction.id,
      sortKey: transaction.sortKey,
      state: stateToCache.state
    });

    await this.cache.put(new StateCacheKey(contractTxId, transaction.sortKey), stateToCache);
  }

  async syncState(contractTxId: string, sortKey: string, state: any, validity: any): Promise<void> {
    const stateToCache = new EvalStateResult(state, validity, {});
    await this.cache.put(new StateCacheKey(contractTxId, sortKey), stateToCache);
  }
}
