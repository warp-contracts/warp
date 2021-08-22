import { BlockHeightCacheResult, BlockHeightKey, BlockHeightSwCache } from '@cache';
import { DefaultStateEvaluator, EvalStateResult, ExecutionContext, ExecutionContextModifier, HandlerApi } from '@core';
import Arweave from 'arweave';
import { GQLNodeInterface } from '@legacy';

/**
 * An implementation of DefaultStateEvaluator that adds caching capabilities
 */
export class CacheableStateEvaluator<State> extends DefaultStateEvaluator<State> {
  constructor(
    arweave: Arweave,
    private readonly cache: BlockHeightSwCache<EvalStateResult<State>>,
    executionContextModifiers: ExecutionContextModifier<State>[] = []
  ) {
    super(arweave, executionContextModifiers);
  }

  async eval(
    executionContext: ExecutionContext<State, any>,
    currentTx: { interactionTxId: string; contractTxId: string }[]
  ): Promise<EvalStateResult<State>> {
    const requestedBlockHeight = executionContext.blockHeight;
    console.log(`Requested state block height: ${requestedBlockHeight}`);

    let cachedState: BlockHeightCacheResult<EvalStateResult<State>> | null = null;

    const sortedInteractionsUpToBlock = executionContext.sortedInteractions.filter((tx) => {
      return tx.node.block.height <= executionContext.blockHeight;
    });

    let missingInteractions = sortedInteractionsUpToBlock.slice();

    // if there was anything to cache...
    if (sortedInteractionsUpToBlock.length > 0) {
      // get latest available cache for the requested block height
      cachedState = this.cache.getLessOrEqual(executionContext.contractDefinition.txId, requestedBlockHeight);

      if (cachedState != null) {
        console.log(`Cached state for ${executionContext.contractDefinition.txId}`, {
          block: cachedState.cachedHeight,
          requestedBlockHeight
        });

        // verify if for the requested block height there are any interactions
        // with higher block height than latest value stored in cache - basically if there are any non-cached interactions.
        missingInteractions = sortedInteractionsUpToBlock.filter(
          ({ node }) => node.block.height > cachedState.cachedHeight && node.block.height <= requestedBlockHeight
        );
      }

      console.log(`Interactions until [${requestedBlockHeight}]`, {
        total: sortedInteractionsUpToBlock.length,
        cached: sortedInteractionsUpToBlock.length - missingInteractions.length
      });

      // I (still) have no idea what I'm doing....
      // TODO: this probably should be removed, as it seems to protect from
      // some specific contract's implementation flaws
      // (i.e. inner calls between two contracts that lead to inf. call loop - circular dependency).
      // Instead - some kind of stack trace should be generated and "stackoverflow"
      // exception should be thrown during contract's execution.
      for (const entry of currentTx || []) {
        if (entry.contractTxId === executionContext.contractDefinition.txId) {
          const index = missingInteractions.findIndex((tx) => tx.node.id === entry.interactionTxId);
          if (index !== -1) {
            console.log('Inf. Loop fix - removing interaction', {
              contractTxId: entry.contractTxId,
              interactionTxId: entry.interactionTxId
            });
            missingInteractions.splice(index, 1);
          }
        }
      }

      // if cache is up-to date - return immediately to speed-up the whole process
      if (missingInteractions.length === 0 && cachedState) {
        console.log(`State up to requested  height [${requestedBlockHeight}]  fully cached!`);
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

  onStateUpdate(
    currentInteraction: GQLNodeInterface,
    executionContext: ExecutionContext<State, HandlerApi<State>>,
    state: EvalStateResult<State>
  ) {
    this.cache.put(
      new BlockHeightKey(executionContext.contractDefinition.txId, currentInteraction.block.height),
      state
    );
  }
}
