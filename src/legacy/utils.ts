import Transaction from 'arweave/node/lib/transaction';

export function getTag(tx: Transaction, name: string) {
  const tags = tx.get('tags') as any;

  for (const tag of tags) {
    // decoding tags can throw on invalid utf8 data.
    try {
      if (tag.get('name', { decode: true, string: true }) === name) {
        return tag.get('value', { decode: true, string: true });
      }
      // eslint-disable-next-line no-empty
    } catch (e) {}
  }

  return false;
}

export function arrayToHex(arr: Uint8Array) {
  let str = '';
  for (const a of arr) {
    str += ('0' + a.toString(16)).slice(-2);
  }
  return str;
}
