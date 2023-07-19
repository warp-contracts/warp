import Arweave from 'arweave';
import { createData, DataItem, Signer } from 'warp-arbundles';
import { ArweaveSigner } from 'warp-contracts-plugin-deploy';
import { DecentralizedSequencer } from '../../../contract/DecentralizedSequencer';
import { WARP_TAGS } from '../../../core/KnownTags';
import { Tag } from '../../../utils/types/arweave-types';

// FIXME: change to the address of the sequencer on dev
const SEQUENCER_URL = 'http://localhost:1317';

describe('Testing a decentralized sequencer', () => {
  let decentralizedSequencer: DecentralizedSequencer;

  beforeAll(async () => {
    decentralizedSequencer = new DecentralizedSequencer(SEQUENCER_URL);
  });

  const createSigner = async (): Promise<Signer> => {
    const wallet = await Arweave.crypto.generateJWK();
    return new ArweaveSigner(wallet);
  }

  const createDataItem = async (signer: Signer, nonce: number): Promise<DataItem> => {
    const tag = new Tag(WARP_TAGS.SEQUENCER_NONCE, String(nonce));
    const dataItem = createData('some data', signer, { tags: [tag] });
    await dataItem.sign(signer);
    return dataItem;
  }

  it('should always return a zero nonce for a new signer', async () => {
    const signer = await createSigner();

    let nonce = await decentralizedSequencer.fetchNonce(signer);
    expect(nonce).toEqual(0);

    nonce = await decentralizedSequencer.fetchNonce(signer);
    expect(nonce).toEqual(0);
  });

  it('should reject a data item with an invalid nonce', async () => {
    const signer = await createSigner();
    const dataItem = await createDataItem(signer, 13);

    expect(decentralizedSequencer.sendDataItem(dataItem, false))
      .rejects
      .toThrowError('account sequence mismatch, expected 0, got 13: incorrect account sequence');
  });

  it('should increment the nonce after sending the data item', async () => {
    const signer = await createSigner();

    let nonce = await decentralizedSequencer.fetchNonce(signer);
    expect(nonce).toEqual(0);

    const dataItem = await createDataItem(signer, nonce);
    await decentralizedSequencer.sendDataItem(dataItem, true);
    nonce = await decentralizedSequencer.fetchNonce(signer);
    expect(nonce).toEqual(1);
  });

  it('should reject an unsigned data item', async () => {
    const signer = await createSigner();
    const dataItem = createData('some data', signer);

    expect(decentralizedSequencer.sendDataItem(dataItem, true))
      .rejects
      .toThrowError('failed to broadcast transaction');
  });

  it('should return an unconfirmed result', async () => {
    const signer = await createSigner();
    const nonce = await decentralizedSequencer.fetchNonce(signer);
    const dataItem = await createDataItem(signer, nonce);
    const result = await decentralizedSequencer.sendDataItem(dataItem, true, 0);

    expect(result.confirmed).toEqual(false);
  });

  it('should return the result without confirmation', async () => {
    const signer = await createSigner();
    const nonce = await decentralizedSequencer.fetchNonce(signer);
    const dataItem = await createDataItem(signer, nonce);
    const result = await decentralizedSequencer.sendDataItem(dataItem, false);

    expect(result.confirmed).toBeUndefined();
  });

});
