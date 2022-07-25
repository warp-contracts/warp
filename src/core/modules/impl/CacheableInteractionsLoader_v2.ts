import {
  defaultCacheOptions,
  EvaluationOptions,
  GQLNodeInterface,
  GW_TYPE,
  InteractionsLoader,
  LevelDbCache,
  LoggerFactory
} from '@warp';

export class CacheableInteractionsLoader_v2 implements InteractionsLoader {
  private readonly logger = LoggerFactory.INST.create('CacheableInteractionsLoader');
  private readonly interactionsCache: Map<string, GQLNodeInterface[]> = new Map();

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

    if (!this.interactionsCache.has(contractTxId)) {
      const interactions = await this.delegate.load(contractTxId, fromSortKey, toSortKey, evaluationOptions);
      this.interactionsCache.set(contractTxId, interactions);
    }

    let cachedInteractions = this.interactionsCache.get(contractTxId);
    if (fromSortKey) {
      // note: fromSortKey is exclusive
      cachedInteractions = cachedInteractions.filter((i) => i.sortKey.localeCompare(fromSortKey) > 0);
    }
    if (toSortKey) {
      // note: fromSortKey is inclusive
      cachedInteractions = cachedInteractions.filter((i) => i.sortKey.localeCompare(toSortKey) <= 0);
    }

    return cachedInteractions;
  }

  type(): GW_TYPE {
    return this.delegate.type();
  }
}
