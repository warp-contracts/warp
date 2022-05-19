import { BlockHeightKey, MemBlockHeightWarpCache } from '@warp/cache';
import { LoggerFactory } from '@warp/logging';
import { Knex } from 'knex';
import { StateCache } from '@warp';
import stringify from 'safe-stable-stringify';

type DbResult = {
  contract_id: string;
  height: number;
  state: string;
};

/**
 * An implementation of {@link BlockHeightWarpCache} that stores its data (ie. contracts state)
 * in a Knex-compatible storage (PostgreSQL, CockroachDB, MSSQL, MySQL, MariaDB, SQLite3, Oracle, and Amazon Redshift)
 * https://knexjs.org
 */
export class KnexStateCache extends MemBlockHeightWarpCache<StateCache<any>> {
  private readonly kLogger = LoggerFactory.INST.create('KnexBlockHeightWarpCache');
  private readonly lastFlushHeight: Map<string, number> = new Map();

  private isFlushing = false;

  private isDirty = false;

  private constructor(
    private readonly knex: Knex,
    maxStoredInMemoryBlockHeights: number = Number.MAX_SAFE_INTEGER,
    cache: DbResult[]
  ) {
    super(maxStoredInMemoryBlockHeights);

    this.saveCache = this.saveCache.bind(this);
    this.flush = this.flush.bind(this);

    this.kLogger.info(`Loaded ${cache.length} cache entries from db`);

    cache.forEach((entry) => {
      this.putSync(
        {
          cacheKey: entry.contract_id,
          blockHeight: entry.height
        },
        JSON.parse(entry.state)
      );
      this.lastFlushHeight.set(entry.contract_id, entry.height);
    });
  }

  public static async init(
    knex: Knex,
    maxStoredInMemoryBlockHeights: number = Number.MAX_SAFE_INTEGER
  ): Promise<KnexStateCache> {
    if (!(await knex.schema.hasTable('states'))) {
      await knex.schema.createTable('states', (table) => {
        table.string('contract_id', 64).notNullable().index();
        table.integer('height').notNullable().index();
        table.text('state').notNullable();
        table.unique(['contract_id', 'height'], { indexName: 'states_composite_index' });
      });
    }

    const cache: DbResult[] = await knex
      .select(['contract_id', 'height', 'state'])
      .from('states')
      .max('height')
      .groupBy(['contract_id']);

    return new KnexStateCache(knex, maxStoredInMemoryBlockHeights, cache);
  }

  private async saveCache() {
    this.isFlushing = true;

    this.kLogger.info(`==== Persisting cache ====`);
    try {
      const contracts = Object.keys(this.storage);
      for (const contractTxId of contracts) {
        // store only highest cached height
        const toStore = await this.getLast(contractTxId);

        // this check is a bit paranoid, since we're iterating on storage keys..
        if (toStore !== null) {
          const { cachedHeight, cachedValue } = toStore;
          if (this.lastFlushHeight.has(contractTxId) && this.lastFlushHeight.get(contractTxId) >= cachedHeight) {
            continue;
          }

          const jsonState = stringify(cachedValue);

          // FIXME: batch insert
          await this.knex
            .insert({
              contract_id: contractTxId,
              height: cachedHeight,
              state: jsonState
            })
            .into('states')
            .onConflict(['contract_id', 'height'])
            .merge();
          this.lastFlushHeight.set(contractTxId, cachedHeight);
        }
      }
      this.isDirty = false;
    } catch (e) {
      this.kLogger.error('Error while flushing cache', e);
    } finally {
      this.isFlushing = false;
      this.kLogger.info(`==== Cache persisted ====`);
    }
  }

  async put({ cacheKey, blockHeight }: BlockHeightKey, value: StateCache<any>): Promise<void> {
    this.isDirty = true;
    return super.put({ cacheKey, blockHeight }, value);
  }

  async flush(): Promise<void> {
    if (this.isFlushing || !this.isDirty) {
      return;
    }

    await this.saveCache();
  }
}
