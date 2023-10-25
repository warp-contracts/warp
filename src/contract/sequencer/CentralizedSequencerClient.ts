import { BundlrResponse } from 'contract/Contract';
import { WarpFetchWrapper } from 'core/WarpFetchWrapper';
import { NetworkCommunicationError, getJsonResponse } from '../../utils/utils';
import { DataItem } from 'warp-arbundles';
import { SendDataItemResponse, SequencerClient } from './SequencerClient';

/**
 * Client for a centralized sequencer.
 */
export class CentralizedSequencerClient implements SequencerClient {
  private registerUrl: string;
  private warpFetchWrapper: WarpFetchWrapper;

  constructor(sequencerUrl: string, warpFetchWrapper: WarpFetchWrapper) {
    this.registerUrl = `${sequencerUrl}/gateway/v2/sequencer/register`;
    this.warpFetchWrapper = warpFetchWrapper;
  }

  /**
   * The sequencer does not have a nonce mechanism; therefore, the method returns undefined.
   * @returns undefined
   */
  getNonce(): Promise<number> {
    return Promise.resolve(undefined);
  }

  /**
   * It sends an interaction to the sequencer and checks if the response has a status of 301 (Moved Permanently).
   */
  async sendDataItem(dataItem: DataItem): Promise<SendDataItemResponse> {
    const result = this.warpFetchWrapper.fetch(this.registerUrl, {
      redirect: 'manual',
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        Accept: 'application/json'
      },
      body: dataItem.getRaw()
    });
    return getJsonResponse<SendDataItemResponse>(
      result,
      (result) => {
        return {
          bundlrResponse: result as BundlrResponse,
          sequencerMoved: false
        };
      },
      async (response) => {
        if (response.status == 301) {
          return {
            bundlrResponse: undefined,
            sequencerMoved: true
          };
        }

        const text = await response.text();
        throw new NetworkCommunicationError(`Wrong response code: ${response.status}. ${text}`);
      }
    );
  }
}
