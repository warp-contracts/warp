import { Signature } from 'contract/Signature';
import { getJsonResponse, stripTrailingSlash } from '../../utils/utils';
import { DataItem } from 'warp-arbundles';
import { CentralizedSequencerClient } from './CentralizedSequencerClient';
import { DecentralizedSequencerClient } from './DecentralizedSequencerClient';
import { WarpFetchWrapper } from 'core/WarpFetchWrapper';

/**
 * The return type of sending an interaction to the sequencer
 */
export type SendDataItemResponse = {
  /**
   * Whether the sequencer returned a "Moved Permanently" status with the address of the new sequencer
   */
  sequencerMoved: boolean;
};

/**
 * A client for connecting to the sequencer, including sending interactions to the sequencer.
 */
export interface SequencerClient {
  /**
   * It returns the nonce for the next interaction signed by a given signer.
   * If the sequencer does not support nonces, it returns undefined.
   */
  getNonce(signature: Signature): Promise<number>;

  /**
   * Clears the stored nonce value.
   */
  clearNonce(): void;

  /**
   * It sends an interaction in the form of a data item to the sequencer.
   * Potentially waits for confirmation that the interaction has been included in the sequencer chain.
   *
   * @param dataItem interaction in the form of a data item
   * @param waitForConfirmation whether to wait for confirmation that the interaction has been included in the chain
   */
  sendDataItem(dataItem: DataItem, waitForConfirmation: boolean): Promise<SendDataItemResponse>;
}

/**
 * The response type from an endpoint returning the address of the current sequencer.
 */
type SequencerAddress = {
  /**
   * The URL address of the sequencer
   */
  url: string;
  /**
   * The type of sequencer
   */
  type: 'centralized' | 'decentralized';
};

/**
 * It queries an endpoint with an address and sequencer type, and returns a client for that sequencer.
 *
 * @param sequencerUrl URL address with an endpoint that returns the sequencer's address
 * @param gatewayUrl Warp gateway URL
 * @param warpFetchWrapper wrapper for fetch operation
 * @returns client for the sequencer
 */
export const createSequencerClient = async (
  gatewayUrl: string,
  warpFetchWrapper: WarpFetchWrapper
): Promise<SequencerClient> => {
  const response = warpFetchWrapper.fetch(`${stripTrailingSlash(gatewayUrl)}/gateway/sequencer/address`);
  const address = await getJsonResponse<SequencerAddress>(response);

  if (address.type == 'centralized') {
    return new CentralizedSequencerClient(address.url, warpFetchWrapper);
  }

  if (address.type == 'decentralized') {
    return new DecentralizedSequencerClient(address.url, gatewayUrl, warpFetchWrapper);
  }

  throw new Error('Unknown sequencer type: ' + address.type);
};
