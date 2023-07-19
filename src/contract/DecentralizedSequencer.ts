import base64url from 'base64url';
import { DataItem, Signer } from 'warp-arbundles';
import { getJsonResponse, NetworkCommunicationError, sleep } from '../utils/utils';
import { LoggerFactory } from '../logging/LoggerFactory';

type NonceResponse = {
  address: string;
  nonce: number;
};

type DataItemResponse = {
  sequencer_tx_hash: string;
  data_item_id: string;
};

export type SendDataItemResponse = {
  sequencer_tx_hash: string;
  confirmed?: boolean;
};

/**
 * Class for communication with a decentralized sequencer.
 */
export class DecentralizedSequencer {
  private readonly logger = LoggerFactory.INST.create('DecentralizedSequencer');

  private _nonceUrl: string;
  private _sendDataItemUrl: string;
  private _getTxUrl: string;

  constructor(sequencerUrl: string) {
    this._nonceUrl = `${sequencerUrl}/api/v1/nonce`;
    this._sendDataItemUrl = `${sequencerUrl}/api/v1/dataitem`;
    this._getTxUrl = `${sequencerUrl}/cosmos/tx/v1beta1/txs/`;
  }

  /**
   * Fetching the sequence (nonce) for an account owned by a given signer.
   *
   * @param signer
   * @returns nonce
   */
  async fetchNonce(signer: Signer): Promise<number> {
    const signatureType = signer.signatureType;
    const owner = base64url.encode(signer.publicKey);

    const response = fetch(this._nonceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ signature_type: signatureType, owner })
    });

    const nonceResponse = await getJsonResponse<NonceResponse>(response);
    this.logger.info('Nonce for owner', { owner, nonceResponse });
    return nonceResponse.nonce;
  }

  /**
   * Broadcasts a data item to the sequencer network and optionally monitoring its inclusion in the blockchain.
   * If the broadcasting is rejected by the node (e.g., during the CheckTx method), an error is thrown.
   * The method returns the transaction hash containing the data item and an optional result of waiting for confirmation
   * that data item has been included in the blockchain.
   *
   * @param dataItem data item to be sent
   * @param waitForConfirmation whether to wait for confirmation that data item has been included in the blockchain
   * @param numberOfTries number of attempts made per second to check if data item has been included in the blockchain
   * @returns transaction hash containing data item and whether its inclusion in the blockchain has been confirmed
   */
  async sendDataItem(
    dataItem: DataItem,
    waitForConfirmation: boolean,
    numberOfTries = 20
  ): Promise<SendDataItemResponse> {
    const response = fetch(this._sendDataItemUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      body: dataItem.getRaw()
    });

    const dataItemResponse = await getJsonResponse<DataItemResponse>(response);
    this.logger.info('Send data item response', dataItemResponse);
    const result: SendDataItemResponse = {
      sequencer_tx_hash: dataItemResponse.sequencer_tx_hash
    };

    if (waitForConfirmation) {
      result.confirmed = await this.confirmTx(dataItemResponse.sequencer_tx_hash, numberOfTries);
    }

    return result;
  }

  private async confirmTx(txHash: string, numberOfTries: number): Promise<boolean> {
    if (numberOfTries <= 0) {
      return false;
    }

    await sleep(1000);

    return (await this.getTx(txHash)) || this.confirmTx(txHash, numberOfTries - 1);
  }

  private async getTx(txHash: string): Promise<boolean> {
    const response = await fetch(this._getTxUrl + txHash);

    if (response.ok) {
      this.logger.info(`The transaction with hash ${txHash} confirmed.`);
      return true;
    } else if (response.status == 404) {
      this.logger.debug(`The transaction with hash ${txHash} not confirmed yet.`);
      return false;
    }

    const text = await response.text();
    throw new NetworkCommunicationError(`${response.status}: ${text}`);
  }
}
