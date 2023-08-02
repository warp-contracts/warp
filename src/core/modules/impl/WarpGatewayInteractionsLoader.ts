import { GQLNodeInterface } from '../../../legacy/gqlResult';
import { Benchmark } from '../../../logging/Benchmark';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import 'warp-isomorphic';
import { getJsonResponse, stripTrailingSlash } from '../../../utils/utils';
import { GW_TYPE, InteractionsLoader } from '../InteractionsLoader';
import { EvaluationOptions } from '../StateEvaluator';
import { Warp } from '../../Warp';
import Database from 'better-sqlite3';
import fs from 'fs';

export type ConfirmationStatus =
  | {
      notCorrupted?: boolean;
      confirmed?: null;
    }
  | {
      notCorrupted?: null;
      confirmed?: boolean;
    };

export const enum SourceType {
  ARWEAVE = 'arweave',
  WARP_SEQUENCER = 'redstone-sequencer',
  BOTH = 'both'
}

type InteractionsResult = {
  interactions: GQLNodeInterface[];
  paging: {
    limit: number;
    items: number;
  };
};

/**
 * The aim of this implementation of the {@link InteractionsLoader} is to make use of
 * Warp Gateway ({@link https://github.com/redstone-finance/redstone-sw-gateway})
 * endpoint and retrieve contracts' interactions.
 *
 * Optionally - it is possible to pass:
 * 1. {@link ConfirmationStatus.confirmed} flag - to receive only confirmed interactions - ie. interactions with
 * enough confirmations, whose existence is confirmed by at least 3 Arweave peers.
 * 2. {@link ConfirmationStatus.notCorrupted} flag - to receive both already confirmed and not yet confirmed (ie. latest)
 * interactions.
 * 3. {@link SourceType} - to receive interactions based on their origin ({@link SourceType.ARWEAVE} or {@link SourceType.WARP_SEQUENCER}).
 * If not set, by default {@link SourceType.BOTH} is set.
 *
 * Passing no flag is the "backwards compatible" mode (ie. it will behave like the original Arweave GQL gateway endpoint).
 * Note that this may result in returning corrupted and/or forked interactions
 * - read more {@link https://github.com/warp-contracts/redstone-sw-gateway#corrupted-transactions}.
 */
export class WarpGatewayInteractionsLoader implements InteractionsLoader {
  private _warp: Warp;
  private _db: Database;

  constructor(
    private readonly confirmationStatus: ConfirmationStatus = null,
    private readonly source: SourceType = SourceType.BOTH
  ) {
    Object.assign(this, confirmationStatus);
    this.source = source;
  }

  private get db() {
    if (!this._db) {
      const dbLocation = './cache/warp/sqlite/interactions/interactions';
      if (!fs.existsSync(dbLocation)) {
        fs.mkdirSync(dbLocation, { recursive: true });
      }
      this._db = new Database(dbLocation + '.db');
      this._db.pragma('journal_mode = WAL');
      if (this.firstRun()) {
        // Incremental auto-vacuum. Reuses space marked as deleted.
        this._db.pragma('auto_vacuum = 2');
        this._db.exec('VACUUM');
      }
      this.sortKeyTable();
    }
    return this._db;
  }

  private firstRun(): boolean {
    const result = this._db
      .prepare(
        `SELECT name
         FROM sqlite_master
         WHERE type = 'table'
           AND tbl_name = 'interactions_cache';`
      )
      .pluck()
      .get();
    return !result;
  }

  private sortKeyTable() {
    this._db.exec(
      `CREATE TABLE IF NOT EXISTS interactions_cache
       (
           id       INTEGER PRIMARY KEY,
           key      TEXT,
           value    TEXT,
           UNIQUE (key)
       )
      `
    );
  }

  private readonly logger = LoggerFactory.INST.create('WarpGatewayInteractionsLoader');

  async load(
    contractId: string,
    fromSortKey?: string,
    toSortKey?: string,
    evaluationOptions?: EvaluationOptions
  ): Promise<GQLNodeInterface[]> {
    this.logger.debug('Loading interactions: for ', { contractId, fromSortKey, toSortKey });

    const interactions: GQLNodeInterface[] = [];
    let page = 0;
    let limit = 0;
    let items = 0;

    const effectiveSourceType = evaluationOptions ? evaluationOptions.sourceType : this.source;
    const benchmarkTotalTime = Benchmark.measure();
    const baseUrl = stripTrailingSlash(this._warp.gwUrl());

    do {
      const benchmarkRequestTime = Benchmark.measure();

      const url = `${baseUrl}/gateway/v2/interactions-sort-key`;

      const params = new URLSearchParams({
        contractId: contractId,
        ...(this._warp.whoAmI ? { client: this._warp.whoAmI } : ''),
        ...(fromSortKey ? { from: fromSortKey } : ''),
        ...(toSortKey ? { to: toSortKey } : ''),
        page: (++page).toString(),
        fromSdk: 'true',
        ...(this.confirmationStatus && this.confirmationStatus.confirmed ? { confirmationStatus: 'confirmed' } : ''),
        ...(this.confirmationStatus && this.confirmationStatus.notCorrupted
          ? { confirmationStatus: 'not_corrupted' }
          : ''),
        ...(effectiveSourceType == SourceType.BOTH ? '' : { source: effectiveSourceType })
      });

      const cacheKey = params.toString();
      let pageInteractions: InteractionsResult = this.getFromCache(cacheKey);
      if (!pageInteractions) {
        pageInteractions = await getJsonResponse<InteractionsResult>(fetch(`${url}?${params}`));
        this.logger.debug(`Loading interactions: page ${page} loaded in ${benchmarkRequestTime.elapsed()}`);
        limit = pageInteractions.paging.limit;
        items = pageInteractions.paging.items;
        if (items == limit) {
          this.logger.debug(`Putting interactions into cache`);
          this.putInCache(cacheKey, pageInteractions);
        }
      } else {
        this.logger.debug(`Interactions cache hit for`, cacheKey);
        limit = pageInteractions.paging.limit;
        items = pageInteractions.paging.items;
        pageInteractions.interactions.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      }

      interactions.push(...pageInteractions.interactions);

      this.logger.debug(`Loaded interactions length: ${interactions.length}, from: ${fromSortKey}, to: ${toSortKey}`);
    } while (items == limit); // note: items < limit means that we're on the last page

    this.logger.debug('All loaded interactions:', {
      from: fromSortKey,
      to: toSortKey,
      loaded: interactions.length,
      time: benchmarkTotalTime.elapsed()
    });

    return interactions;
  }

  private getFromCache(cacheKey: string): InteractionsResult | null {
    const result = this.db
      .prepare(
        `SELECT value
         FROM interactions_cache
         WHERE key = ?;`
      )
      .pluck()
      .get(cacheKey);

    if (result) {
      return JSON.parse(result);
    }
    return null;
  }

  private putInCache(cacheKey: string, pageInteractions: InteractionsResult) {
    const strVal = JSON.stringify(pageInteractions);
    this.db.prepare('INSERT OR REPLACE INTO interactions_cache (key, value) VALUES (@key, @value)').run({
      key: cacheKey,
      value: strVal
    });
  }

  type(): GW_TYPE {
    return 'warp';
  }

  clearCache(): void {
    // noop
  }

  set warp(warp: Warp) {
    this._warp = warp;
  }
}
