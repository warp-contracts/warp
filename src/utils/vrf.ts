import elliptic from 'elliptic';
import Arweave from 'arweave';
import { Evaluate } from '@idena/vrf-js';
import { bufToBn } from './utils';
import { VrfData } from '../legacy/gqlResult';

const EC = new elliptic.ec('secp256k1');
const key = EC.genKeyPair();
const pubKeyS = key.getPublic(true, 'hex');

export function generateMockVrf(sortKey: string, arweave: Arweave): VrfData {
  const data = arweave.utils.stringToBuffer(sortKey);
  const [index, proof] = Evaluate(key.getPrivate().toArray(), data);
  return {
    index: arweave.utils.bufferTob64Url(index),
    proof: arweave.utils.bufferTob64Url(proof),
    bigint: bufToBn(index).toString(),
    pubkey: pubKeyS
  };
}
