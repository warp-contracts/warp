import base64url from 'base64url';
import { DataItem } from 'warp-arbundles';
import { getJsonResponse, NetworkCommunicationError, sleep } from '../../utils/utils';
import { LoggerFactory } from '../../logging/LoggerFactory';
import { WarpFetchWrapper } from '../../core/WarpFetchWrapper';
import { SendDataItemResponse, SequencerClient } from './SequencerClient';
import { Signature } from 'contract/Signature';

type NonceResponse = {
  address: string;
  nonce: number;
};

type CheckTxResponse = {
  confirmed: boolean;
  txHash?: string;
};

/**
 * Client for a decentralized sequencer.
 */
export class DecentralizedSequencerClient implements SequencerClient {
  private readonly logger = LoggerFactory.INST.create('DecentralizedSequencerClient');

  private nonceUrl: string;
  private sendDataItemUrl: string;
  private getTxUrl: string;
  private warpFetchWrapper: WarpFetchWrapper;

  constructor(sequencerUrl: string, warpFetchWrapper: WarpFetchWrapper) {
    this.nonceUrl = `${sequencerUrl}/api/v1/nonce`;
    this.sendDataItemUrl = `${sequencerUrl}/api/v1/dataitem`;
    this.getTxUrl = `${sequencerUrl}/api/v1/tx-data-item-id`;
    this.warpFetchWrapper = warpFetchWrapper;
  }

  /**
   * Returns the sequence (nonce) for an account owned by a given signer. The result is stored in the signature class's counter.
   * For subsequent interactions, the nonce will be retrieved from the signature's counter without communication with the sequencer.
   *
   * @param signature the signature for which the nonce is calculated
   * @returns nonce
   */
  async getNonce(signature: Signature): Promise<number> {
    const nonce = signature.sequencerNonce;
    if (nonce !== undefined) {
      signature.sequencerNonce = nonce + 1;
      return nonce;
    }

    return this.fetchNonce(signature);
  }

  /**
   * It retrieves the nonce from the sequencer for the next interaction.
   */
  private async fetchNonce(signature: Signature): Promise<number> {
    const bundlerSigner = signature.bundlerSigner;
    if (!bundlerSigner) {
      throw new Error(
        'Signer not set correctly. To use the decentralized sequencer, one should use the BundlerSigner type.'
      );
    }

    const signatureType = bundlerSigner.signatureType;
    const owner = base64url.encode(bundlerSigner.publicKey);

    const response = this.warpFetchWrapper.fetch(this.nonceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ signature_type: signatureType, owner })
    });

    const nonceResponse = await getJsonResponse<NonceResponse>(response);
    this.logger.info('Nonce for owner', { owner, nonceResponse });
    signature.sequencerNonce = nonceResponse.nonce + 1;
    return nonceResponse.nonce;
  }

  /**
   * Broadcasts a data item to the sequencer network and optionally monitoring its inclusion in the blockchain.
   * If the broadcasting is rejected by the node (e.g., during the CheckTx method), an error is thrown.
   * If the option to wait for confirmation is selected,
   * the hash of the sequencer transaction containing the interaction is returned.
   *
   * @param dataItem data item to be sent
   * @param waitForConfirmation whether to wait for confirmation that data item has been included in the blockchain
   * @returns hash of the sequencer transaction if wait for confirmation is selected
   */
  async sendDataItem(dataItem: DataItem, waitForConfirmation: boolean): Promise<SendDataItemResponse> {
    const response = await this.sendDataItemWithRetry(dataItem);

    if (waitForConfirmation) {
      response.sequencerTxHash = await this.confirmTx(await dataItem.id);
    }

    return response;
  }

  /**
   * Sends a data item to the sequencer.
   * It retries in case of 'Service Unavailable' status and throws an error if the interaction is rejected by the sequencer.
   *
   * @param dataItem data item to be sent
   * @param numberOfTries the number of retries
   */
  private async sendDataItemWithRetry(dataItem: DataItem, numberOfTries = 20): Promise<SendDataItemResponse> {
    if (numberOfTries <= 0) {
      throw new Error(
        `Failed to send the interaction (id = ${await dataItem.id}) to the sequencer despite multiple retries`
      );
    }

    if (await this.tryToSendDataItem(dataItem)) {
      return { sequencerMoved: false };
    } else {
      await sleep(1000);
      return this.sendDataItemWithRetry(dataItem, numberOfTries - 1);
    }
  }

  private async tryToSendDataItem(dataItem: DataItem): Promise<boolean> {
    const response = await this.warpFetchWrapper.fetch(this.sendDataItemUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      body: dataItem.getRaw()
    });

    if (response.ok) {
      return true;
    }

    if (response.status == 503) {
      return false;
    }

    if (response.status == 409) {
      const error = await response.json();
      throw new Error(
        `Interaction (id = ${await dataItem.id}) rejected by the sequencer due to an invalid nonce, error message: ${
          error.message.RawLog
        }}`
      );
    }

    if (response.status == 400) {
      const error = await response.json();
      throw new Error(
        `Interaction (id = ${await dataItem.id}) rejected by the sequencer: error type: ${
          error.type
        }, error message: ${JSON.stringify(error.message)}`
      );
    }

    const text = await response.text();
    throw new NetworkCommunicationError(`Wrong response code: ${response.status}. ${text}`);
  }

  /**
   * It queries the sequencer every second to check if the data item is in the chain
   *
   * @param dataItem data item to be sent
   * @param numberOfTries the number of retries
   */
  private async confirmTx(dataItemId: string, numberOfTries = 20): Promise<string> {
    if (numberOfTries <= 0) {
      throw new Error(`Failed to confirm of the interaction with id = ${dataItemId} in the sequencer network`);
    }

    await sleep(1000);

    const result = await this.checkTx(dataItemId);
    if (!result.confirmed) {
      return this.confirmTx(dataItemId, numberOfTries - 1);
    }
    return result.txHash;
  }

  private async checkTx(dataItemId: string): Promise<CheckTxResponse> {
    const response = await this.warpFetchWrapper.fetch(this.getTxUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data_item_id: dataItemId })
    });

    if (response.ok) {
      const result = await response.json();
      this.logger.info(`The transaction with hash ${result.tx_hash} confirmed.`);
      return { confirmed: true, txHash: result.tx_hash };
    }

    if (response.status == 404) {
      this.logger.debug(`The transaction with data item id (${dataItemId}) not confirmed yet.`);
      return { confirmed: false };
    }

    const text = await response.text();
    throw new NetworkCommunicationError(`${response.status}: ${text}`);
  }
}
