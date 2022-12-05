import { GQLNodeInterface } from '../../../legacy/gqlResult';

export function isConfirmedInteraction(tx: GQLNodeInterface): boolean {
  // in case of using non-warp gateway
  if (tx.confirmationStatus === undefined) {
    return true;
  } else {
    return tx.confirmationStatus === 'confirmed';
  }
}
