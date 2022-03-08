import {EvalStateResult, GQLNodeInterface} from '@smartweave';

//export type StateCache<State> = Array<EvalStateResult<State>>;
export type StateCache<State> = EvalStateResult<State>;

export function canBeCached(tx: GQLNodeInterface): boolean {
  // in case of using non-redstone gateway
  if (tx.confirmationStatus === undefined) {
    return true;
  } else {
    return tx.confirmationStatus === 'confirmed'
  }
}
