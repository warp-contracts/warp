import { BlockHeightKey, MemBlockHeightSwCache } from '@smartweave/cache';
import { LoggerFactory } from '@smartweave/logging';
import { Knex } from 'knex';
import { createHash } from 'crypto';
import { StateCache } from '@smartweave';

type DbResult = {
  contract_id: string;
  height: number;
  state: string;
};

/**
 * An implementation of {@link BlockHeightSwCache} that stores its data (ie. contracts state)
 * in a Knex-compatible storage (PostgreSQL, CockroachDB, MSSQL, MySQL, MariaDB, SQLite3, Oracle, and Amazon Redshift)
 * https://knexjs.org
 */
export class KnexStateCache extends MemBlockHeightSwCache<StateCache<any>> {
  private readonly kLogger = LoggerFactory.INST.create('KnexBlockHeightSwCache');

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

    cache.forEach((entry) => {
      this.putSync(
        {
          cacheKey: entry.contract_id,
          blockHeight: entry.height
        },
        JSON.parse(entry.state)
      );
    });

    process.on('exit', async () => {
      await this.flush();
      process.exit();
    });
    process.on('SIGINT', async () => {
      await this.flush();
      process.exit();
    });
  }

  public static async init(
    knex: Knex,
    maxStoredInMemoryBlockHeights: number = Number.MAX_SAFE_INTEGER
  ): Promise<KnexStateCache> {
    if (!(await knex.schema.hasTable('states'))) {
      await knex.schema.createTable('states', (table) => {
        table.string('contract_id', 64).notNullable().index();
        table.bigInteger('height').notNullable().index();
        table.string('hash').notNullable().unique();
        table.json('state').notNullable();
        table.unique(['contract_id', 'height', 'hash'], { indexName: 'states_composite_index' });
      });
    }

    const cache: DbResult[] = await knex
      .select(['contract_id', 'height', 'state'])
      .from('states')
      .max('height')
      .groupBy('contract_id')
      .orderBy('height', 'desc');

    return new KnexStateCache(knex, maxStoredInMemoryBlockHeights, cache);
  }

  private async saveCache() {
    this.isFlushing = true;

    this.kLogger.info(`==== Persisting cache ====`);
    try {
      for (const contractTxId of Object.keys(this.storage)) {
        // store only highest cached height
        const toStore = await this.getLast(contractTxId);

        // this check is a bit paranoid, since we're iterating on storage keys..
        if (toStore !== null) {
          const { cachedHeight, cachedValue } = toStore;

          // note: JSON.stringify is non-deterministic
          // switch to https://www.npmjs.com/package/json-stringify-deterministic ?
          const jsonState = JSON.stringify(cachedValue);

          // note: cannot reuse:
          // "The Hash object can not be used again after hash.digest() method has been called.
          // Multiple calls will cause an error to be thrown."
          const hash = createHash('sha256');

          hash.update(`${contractTxId}|${cachedHeight}|${JSON.stringify(cachedValue)}`);
          const digest = hash.digest('hex');

          // FIXME: batch insert
          await this.knex
            .insert({
              contract_id: contractTxId,
              height: cachedHeight,
              hash: digest,
              state: jsonState
            })
            .into('states')
            .onConflict(['contract_id', 'height', 'hash'])
            .merge();
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
