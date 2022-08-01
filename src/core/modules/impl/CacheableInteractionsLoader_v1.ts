import {
  CacheKey,
  defaultCacheOptions,
  EvaluationOptions,
  GQLNodeInterface,
  GW_TYPE,
  InteractionsLoader,
  LevelDbCache,
  LoggerFactory,
  SortKeyCache
} from '@warp';

export class CacheableInteractionsLoader_v1 implements InteractionsLoader {
  private readonly logger = LoggerFactory.INST.create('CacheableInteractionsLoader');
  private readonly interactionsCache: SortKeyCache<GQLNodeInterface[]>;

  constructor(private readonly delegate: InteractionsLoader, cacheOptions = defaultCacheOptions) {
    this.interactionsCache = new LevelDbCache(cacheOptions);
  }

  async load(
    contractTxId: string,
    fromSortKey?: string,
    toSortKey?: string,
    evaluationOptions?: EvaluationOptions
  ): Promise<GQLNodeInterface[]> {
    this.logger.debug(`Loading interactions for`, {
      contractTxId,
      fromSortKey,
      toSortKey
    });

    let originalCachedInteractions: GQLNodeInterface[];
    let effectiveCachedInteractions: GQLNodeInterface[];
    if (toSortKey) {
      originalCachedInteractions = (await this.interactionsCache.getLessOrEqual(contractTxId, toSortKey)).cachedValue;
    } else {
      originalCachedInteractions = (await this.interactionsCache.getLast(contractTxId)).cachedValue;
    }
    // if anything was cached
    if (originalCachedInteractions?.length) {
      // cache MUST always contain all values from the first interaction 'till cached sortKey
      // if fromSortKey is specified, we need to first filter the cached interactions
      if (fromSortKey) {
        effectiveCachedInteractions = originalCachedInteractions.filter(
          (i) => i.sortKey.localeCompare(fromSortKey) >= 0
        );
      } else {
        effectiveCachedInteractions = originalCachedInteractions;
      }
      const lastCachedKey = effectiveCachedInteractions[effectiveCachedInteractions.length - 1].sortKey;

      if (toSortKey && toSortKey.localeCompare(lastCachedKey) == 0) {
        // if 'toSortKey' was specified and exactly the same as lastCachedKey - return immediately
        this.logger.debug(`Interaction fully cached`, {
          contractTxId,
          fromSortKey,
          toSortKey
        });
        // TODO: add sanity check
        return effectiveCachedInteractions;
      } else {
        // if either toSortKey was not specified or toSortKey is different from lastCachedKey
        // - we need to download the (potentially) missing interactions - from the lastCacheKey
        const missingInteractions = await this.delegate.load(contractTxId, lastCachedKey, toSortKey, evaluationOptions);
        // at each given sortKey we need to cache all the interactions, not those filtered from 'fromSortKey'
        const toCache = originalCachedInteractions.concat(missingInteractions);
        await this.doCache(contractTxId, toCache);
        return effectiveCachedInteractions.concat(missingInteractions);
      }
    } else {
      // no values found in cache - load data from gateway

      // sanity check - if no value was cached, then this means we're making an initial state evaluation
      // - so the fromSortKey should not be set
      if (fromSortKey) {
        throw new Error('fromSortKey should not be specified when no interactions found in cache');
      }
      const missingInteractions = await this.delegate.load(contractTxId, fromSortKey, toSortKey, evaluationOptions);
      await this.doCache(contractTxId, missingInteractions);
      return missingInteractions;
    }
  }

  private async doCache(contractTxId: string, interactions: GQLNodeInterface[]): Promise<void> {
    // we can only cache fully confirmed interactions (for Warp gateway)
    // in case of Arweave gateway (when no confirmationStatus is set) - all interactions are always cached
    const interactionsToCache = interactions.filter(
      (i) => i.confirmationStatus == undefined || i.confirmationStatus == 'confirmed'
    );
    const cacheSortKey = interactionsToCache[interactionsToCache.length - 1].sortKey;
    await this.interactionsCache.put(new CacheKey(contractTxId, cacheSortKey), interactionsToCache);
  }

  type(): GW_TYPE {
    return this.delegate.type();
  }

  clearCache(): void {
    // noop
  }
}
