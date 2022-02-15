/* eslint-disable */
import {GQLEdgeInterface, InteractionsLoader, LoggerFactory, sleep, SourceType, stripTrailingSlash} from '@smartweave';
import 'redstone-isomorphic';
import Parser from 'parse-json-stream';
import {ReadableStream} from 'node:stream/web';

type ConfirmationStatus =
  | {
  notCorrupted?: boolean;
  confirmed?: null;
}
  | {
  notCorrupted?: null;
  confirmed?: boolean;
};

const MIN_INTERACTIONS_PER_CHUNK = 500;

export class RedstoneStreamableInteractionsLoader implements InteractionsLoader {
  constructor(
    private readonly baseUrl: string,
    private readonly confirmationStatus: ConfirmationStatus = null,
    private readonly source: SourceType = null
  ) {
    this.baseUrl = stripTrailingSlash(baseUrl);
    Object.assign(this, confirmationStatus);
    this.source = source;
  }

  private readonly logger = LoggerFactory.INST.create('RedStoneStreamableInteractionsLoader');

  async load(
    contractId: string,
    fromBlockHeight: number,
    toBlockHeight: number
  ): Promise<GQLEdgeInterface[] | ReadableStream<GQLEdgeInterface[]>> {
    this.logger.debug('Streaming interactions: for ', {contractId, fromBlockHeight, toBlockHeight});

    const loadData = this.loadData.bind(this);

    const stream = new ReadableStream<GQLEdgeInterface[]>({
      start(controller) {
        loadData(controller, contractId, fromBlockHeight, toBlockHeight).finally();
      }
    });

    this.logger.debug("Returning stream");

    return stream;
  }

  private async loadData(
    streamController: ReadableStreamController<GQLEdgeInterface[]>,
    contractId: string,
    fromBlockHeight: number,
    toBlockHeight: number) {
    const result = [];
    let resultChunk = [];
    let chunkBlockHeight = null;
    const logger = this.logger;

    const parser = new Parser(function (error, object) {
      if (error) {
        logger.error(error.message);
        streamController.error(error);
        streamController.close();
      } else if (object) {
        const blockHeight = object.interaction.block.height;
        if (chunkBlockHeight != null) {
          // sanity check...
          if (blockHeight < chunkBlockHeight) {
            throw Error('Next streamed interaction should not have block height lower than previous interaction');
          } else if (chunkBlockHeight == blockHeight) {
            // we need to assure that all interactions from the given block
            // will be in the same "chunk" posted to state evaluator
            resultChunk.push({
              cursor: '',
              node: {
                ...object.interaction,
                confirmationStatus: object.status
              }
            });
          } else if (blockHeight > chunkBlockHeight) {
            result.push(resultChunk);
            streamController.enqueue(resultChunk);
            resultChunk = [];
            resultChunk.push({
              cursor: '',
              node: {
                ...object.interaction,
                confirmationStatus: object.status
              }
            });
            chunkBlockHeight = null;
          }
        } else {
          resultChunk.push({
            cursor: '',
            node: {
              ...object.interaction,
              confirmationStatus: object.status
            }
          });
          if (resultChunk.length >= MIN_INTERACTIONS_PER_CHUNK) {
            chunkBlockHeight = blockHeight;
          }
        }
      } else {
        if (resultChunk.length) {
          result.push(resultChunk);
          streamController.enqueue(resultChunk);
        }
        streamController.close(); // marks end of stream
        logger.debug('Chunks', result.length);
        let totalLength = 0;

        for (const r of result) {
          totalLength += r.length;
        }

        logger.debug('Total interactions', totalLength);
      }
    });

    const response = await fetch(
      `${this.baseUrl}/gateway/interactions-stream?${new URLSearchParams({
        contractId: contractId,
        from: fromBlockHeight.toString(),
        to: toBlockHeight.toString(),
        ...(this.confirmationStatus && this.confirmationStatus.confirmed ? {confirmationStatus: 'confirmed'} : ''),
        ...(this.confirmationStatus && this.confirmationStatus.notCorrupted
          ? {confirmationStatus: 'not_corrupted'}
          : ''),
        ...(this.source ? {source: this.source} : '')
      })}`
    );

    const decoder = new TextDecoder('utf-8');

    // @ts-ignore
    for await (const chunk of response.body) {
      const chunkString = decoder.decode(chunk);
      parser.parse(chunkString);
    }
  }
}
