import { BlockHeightCacheResult, BlockHeightKey, BlockHeightSwCache } from '@smartweave/cache';
import {
  DefaultStateEvaluator,
  EvalStateResult,
  ExecutionContext,
  ExecutionContextModifier,
  HandlerApi
} from '@smartweave/core';
import Arweave from 'arweave';
import { GQLNodeInterface } from '@smartweave/legacy';
import { Benchmark, LoggerFactory } from '@smartweave/logging';

/**
 * An implementation of DefaultStateEvaluator that adds caching capabilities
 */
export class CacheableStateEvaluator extends DefaultStateEvaluator {
  private readonly cLogger = LoggerFactory.INST.create('CacheableStateEvaluator');

  constructor(
    arweave: Arweave,
    private readonly cache: BlockHeightSwCache<EvalStateResult<unknown>>,
    executionContextModifiers: ExecutionContextModifier[] = []
  ) {
    super(arweave, executionContextModifiers);
  }

  async eval<State>(
    executionContext: ExecutionContext<State, HandlerApi<State>>,
    currentTx: { interactionTxId: string; contractTxId: string }[]
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

      // TODO: this probably should be removed, as it seems to protect from
      // some specific contract's implementation flaws
      // (i.e. inner calls between two contracts that lead to inf. call loop - circular dependency).
      // Instead - some kind of stack trace should be generated and "stackoverflow"
      // exception should be thrown during contract's execution.
      for (const entry of currentTx || []) {
        if (entry.contractTxId === executionContext.contractDefinition.txId) {
          const index = missingInteractions.findIndex((tx) => tx.node.id === entry.interactionTxId);
          if (index !== -1) {
            this.cLogger.debug('Inf. Loop fix - removing interaction', {
              height: missingInteractions[index].node.block.height,
              contractTxId: entry.contractTxId,
              interactionTxId: entry.interactionTxId
            });
            missingInteractions.splice(index, 1);
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
    lastInteraction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>
  ): Promise<void> {
    this.cLogger.debug(
      `onStateEvaluated: cache update for contract ${executionContext.contractDefinition.txId} [${lastInteraction.block.height}]`
    );
    await this.cache.put(
      new BlockHeightKey(executionContext.contractDefinition.txId, lastInteraction.block.height),
      state
    );
  }

  async onStateUpdate<State>(
    currentInteraction: GQLNodeInterface,
    executionContext: ExecutionContext<State, unknown>,
    state: EvalStateResult<State>
  ): Promise<void> {
    if (executionContext.evaluationOptions.updateCacheForEachInteraction) {
      await this.cache.put(
        new BlockHeightKey(executionContext.contractDefinition.txId, currentInteraction.block.height),
        state
      );
    }
  }

  async latestAvailableState<State>(
    contractTxId: string,
    blockHeight: number
  ): Promise<BlockHeightCacheResult<EvalStateResult<State>> | null> {
    return (await this.cache.getLessOrEqual(contractTxId, blockHeight)) as BlockHeightCacheResult<
      EvalStateResult<State>
    >;
  }
}
