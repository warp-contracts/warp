import { InteractionState } from './InteractionState';
import { BatchDBOp } from '../../cache/SortKeyCache';
import { EvalStateResult } from '../../core/modules/StateEvaluator';
import { GQLNodeInterface } from '../../legacy/gqlResult';
import { Warp } from '../../core/Warp';

export class ContractInteractionState implements InteractionState {
  private readonly _json = new Map<string, EvalStateResult<unknown>>();
  private readonly _initialJson = new Map<string, EvalStateResult<unknown>>();

  private readonly _kv = new Map<string, BatchDBOp<unknown>[]>();

  constructor(private readonly _warp: Warp) {}

  has(contractTx): boolean {
    return this._json.has(contractTx);
  }

  get(contractTxId: string): EvalStateResult<unknown> {
    return this._json.get(contractTxId) || null;
  }

  getKV<T>(contractTxId: string): BatchDBOp<T>[] | null {
    return this._kv.get(contractTxId) as BatchDBOp<T>[] || null;
  }

  // TODO. TWL good luck with this one :-)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  getKVRange(contractTxId: string, key: string): unknown {
    throw new Error('Method not implemented.');
  }

  async commit(interaction: GQLNodeInterface): Promise<void> {
    if (interaction.dry) {
      return;
    }
    try {
      await this.doStoreJson(this._json, interaction);
      await this.doStoreKV();
    } finally {
      this.reset();
    }
  }

  async commitKV(): Promise<void> {
    await this.doStoreKV();
    this._kv.clear();
  }

  async rollback(interaction: GQLNodeInterface): Promise<void> {
    try {
      await this.doStoreJson(this._initialJson, interaction);
    } finally {
      this.reset();
    }
  }

  setInitial(contractTxId: string, state: EvalStateResult<unknown>): void {
    // think twice here.
    this._initialJson.set(contractTxId, state);
    this._json.set(contractTxId, state);
  }

  update(contractTxId: string, state: EvalStateResult<unknown>): void {
    this._json.set(contractTxId, state);
  }

  updateKV(contractTxId: string, ops: BatchDBOp<unknown>[]): void {
    if (!this._kv.has(contractTxId)) {
      this._kv.set(contractTxId, ops);
    } else {
      this._kv.set(contractTxId, this._kv.get(contractTxId).concat(ops));
    }
  }

  private reset(): void {
    this._json.clear();
    this._initialJson.clear();
    this._kv.clear();
  }

  private async doStoreJson(states: Map<string, EvalStateResult<unknown>>, interaction: GQLNodeInterface) {
    if (states.size > 1) {
      for (const [k, v] of states) {
        await this._warp.stateEvaluator.putInCache(k, interaction, v);
      }
    }
  }

  private async doStoreKV(): Promise<void> {
    for (const [contractTxId, batch] of this._kv) {
      const storage = this._warp.kvStorageFactory(contractTxId);

      try {
        await storage.open();
        await storage.batch(batch);
      } finally {
        await storage.close();
      }
    }
  }
}
