import Arweave from 'arweave';
import { createData, DataItem, Signer } from 'warp-arbundles';
import { ArweaveSigner } from 'warp-contracts-plugin-deploy';
import { DecentralizedSequencerClient } from '../../../contract/sequencer/DecentralizedSequencerClient';
import { SMART_WEAVE_TAGS, WARP_TAGS } from '../../../core/KnownTags';
import { Tag } from '../../../utils/types/arweave-types';
import { WarpFactory } from '../../../core/WarpFactory';
import { WarpFetchWrapper } from '../../../core/WarpFetchWrapper';
import { Signature } from '../../../contract/Signature';

// FIXME: change to the address of the sequencer on dev
const SEQUENCER_URL = 'http://sequencer-0.warp.cc:1317';

describe('Testing a decentralized sequencer client', () => {
  let client: DecentralizedSequencerClient;

  beforeAll(async () => {
    const warpFetchWrapper = new WarpFetchWrapper(WarpFactory.forLocal())
    client = new DecentralizedSequencerClient(SEQUENCER_URL, warpFetchWrapper);
  });

  const createSignature = async (): Promise<Signature> => {
    const wallet = await Arweave.crypto.generateJWK();
    const signer = new ArweaveSigner(wallet);
    return new Signature(WarpFactory.forLocal(), signer)
  }

  const createDataItem = async (signature: Signature, nonce: number, addNonceTag = true, addContractTag = true, signDataItem = true): Promise<DataItem> => {
    const signer = signature.bundlerSigner;
    const tags: Tag[] = [];
    if (addNonceTag) {
      tags.push(new Tag(WARP_TAGS.SEQUENCER_NONCE, String(nonce)));
    }
    if (addContractTag) {
      tags.push(new Tag(SMART_WEAVE_TAGS.CONTRACT_TX_ID, "unit test contract"));
    }
    const dataItem = createData('some data', signer, { tags });
    if (signDataItem) {
      await dataItem.sign(signer);
    }
    return dataItem;
  }

  it('should return consecutive nonces for a given signature', async () => {
    const signature = await createSignature()
    let nonce = await client.getNonce(signature);
    expect(nonce).toEqual(0);

    nonce = await client.getNonce(signature);
    expect(nonce).toEqual(1);
  });

  it('should reject a data item with an invalid nonce', async () => {
    const signature = await createSignature()
    const dataItem = await createDataItem(signature, 13);

    expect(client.sendDataItem(dataItem, false))
      .rejects
      .toThrowError('account sequence mismatch, expected 0, got 13: incorrect account sequence');
  });

  it('should reject a data item without nonce', async () => {
    const signature = await createSignature()
    const dataItem = await createDataItem(signature, 0, false);

    expect(client.sendDataItem(dataItem, true))
      .rejects
      .toThrowError('no sequencer nonce tag');
  });

  it('should reject a data item without contract', async () => {
    const signature = await createSignature()
    const dataItem = await createDataItem(signature, 0, true, false);

    expect(client.sendDataItem(dataItem, true))
      .rejects
      .toThrowError('no contract tag');
  });

  it('should reject an unsigned data item', async () => {
    const signature = await createSignature()
    const dataItem = await createDataItem(signature, 0, true, true, false);

    expect(client.sendDataItem(dataItem, true))
      .rejects
      .toThrowError('data item verification error');
  });

  it('should return a confirmed result', async () => {
    const signature = await createSignature();
    const nonce = await client.getNonce(signature);
    const dataItem = await createDataItem(signature, nonce);
    const result = await client.sendDataItem(dataItem, true);

    expect(result.sequencerMoved).toEqual(false);
    expect(result.bundlrResponse).toBeUndefined();
    expect(result.sequencerTxHash).toBeDefined();
  });

  it('should return an unconfirmed result', async () => {
    const signature = await createSignature();
    const nonce = await client.getNonce(signature);
    const dataItem = await createDataItem(signature, nonce);
    const result = await client.sendDataItem(dataItem, false);
  
    expect(result.sequencerMoved).toEqual(false);
    expect(result.bundlrResponse).toBeUndefined();
    expect(result.sequencerTxHash).toBeUndefined();
  });
});
