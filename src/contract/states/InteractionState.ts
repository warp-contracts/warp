import { BatchDBOp } from '../../cache/SortKeyCache';
import { EvalStateResult } from '../../core/modules/StateEvaluator';
import { GQLNodeInterface } from '../../legacy/gqlResult';

// Handles contracts state (both the json-based and kv-based) during interaction evaluation
export interface InteractionState {
  /**
   * Sets the state for a given contract as it is at the beginning of the interaction evaluation.
   * If the interaction evaluation of the root contract will fail (i.e. its result type is != 'ok')
   * - this initial state will be committed to the cache for this interaction.
   * In other words - all changes made during evaluation of this interaction will be rollbacked.
   */
  setInitial(contractTxId: string, state: EvalStateResult<unknown>): void;

  /**
   * Updates the json-state for a given contract during interaction evaluation - e.g. as a result of an internal write
   */
  update(contractTxId: string, state: EvalStateResult<unknown>): void;

  /**
   * Updates the kv-state for a given contract during interaction evaluation
   */
  updateKV(contractTxId: string, ops: BatchDBOp<unknown>[]): void;

  /**
   * commits all the state changes made for all contracts within given interaction evaluation.
   * Called by the {@link DefaultStateEvaluator} at the end every root's contract interaction evaluation
   * - IFF the result.type == 'ok'.
   */
  commit(interaction: GQLNodeInterface): Promise<void>;

  commitKV(): Promise<void>;

  /**
   * rollbacks all the state changes made for all contracts within given interaction evaluation.
   * Called by the {@link DefaultStateEvaluator} at the end every root's contract interaction evaluation
   * - IFF the result.type != 'ok'.
   * This ensures atomicity of state changes withing any given interaction - also in case of internal contract calls.
   */
  rollback(interaction: GQLNodeInterface): Promise<void>;

  has(contractTxId: string): boolean;

  get(contractTxId: string): EvalStateResult<unknown> | null;

  getKV<T>(contractTxId: string): BatchDBOp<T>[] | null;

  // TODO
  getKVRange(contractTxId: string, key: string): unknown | null;
}
