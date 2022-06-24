import {
  BadGatewayResponse,
  Benchmark,
  BlockHeightKey,
  BlockHeightWarpCache,
  EvaluationOptions,
  GQLEdgeInterface,
  InteractionsLoader,
  LoggerFactory
} from '@warp';
import { AppError } from '@warp/utils';
import { ok, Result } from 'neverthrow';

/**
 * This implementation of the {@link InteractionsLoader} tries to limit the amount of interactions
 * with GraphQL endpoint. Additionally, it is downloading only the missing interactions
 * (starting from the latest already cached) - to additionally limit the amount of "paging".
 */
export class CacheableContractInteractionsLoader implements InteractionsLoader {
  private readonly logger = LoggerFactory.INST.create('CacheableContractInteractionsLoader');

  constructor(
    private readonly baseImplementation: InteractionsLoader,
    private readonly cache: BlockHeightWarpCache<GQLEdgeInterface[]>
  ) {}

  async load(
    contractId: string,
    fromBlockHeight: number,
    toBlockHeight: number,
    evaluationOptions?: EvaluationOptions
  ): Promise<Result<GQLEdgeInterface[], AppError<BadGatewayResponse>>> {
    const benchmark = Benchmark.measure();
    this.logger.debug('Loading interactions', {
      contractId,
      fromBlockHeight,
      toBlockHeight
    });

    const { cachedHeight, cachedValue } = (await this.cache.getLast(contractId)) || {
      cachedHeight: -1,
      cachedValue: []
    };

    if (cachedHeight >= toBlockHeight) {
      this.logger.debug('Reusing interactions cached at higher block height:', cachedHeight);
      return ok(
        cachedValue.filter(
          (interaction: GQLEdgeInterface) =>
            interaction.node.block.height >= fromBlockHeight && interaction.node.block.height <= toBlockHeight
        )
      );
    }

    this.logger.trace('Cached:', {
      cachedHeight,
      cachedValue
    });

    const missingInteractions = await this.baseImplementation.load(
      contractId,
      Math.max(cachedHeight + 1, fromBlockHeight),
      toBlockHeight,
      evaluationOptions
    );

    if (missingInteractions.isErr()) {
      return missingInteractions;
    }

    const result = cachedValue
      .filter((interaction: GQLEdgeInterface) => interaction.node.block.height >= fromBlockHeight)
      .concat(missingInteractions.value);

    const valueToCache = cachedValue.concat(missingInteractions.value);

    this.logger.debug('Interactions load result:', {
      cached: cachedValue.length,
      missing: missingInteractions.value.length,
      total: valueToCache.length,
      result: result.length
    });
    // note: interactions in cache should be always saved from the "0" block
    // - that's why "result" variable is not used here
    await this.cache.put(new BlockHeightKey(contractId, toBlockHeight), valueToCache);

    this.logger.debug(`Interactions loaded in ${benchmark.elapsed()}`);

    return ok(result);
  }
}
