/* eslint-disable */
import { GQLEdgeInterface, InteractionsLoader, LoggerFactory, SourceType, stripTrailingSlash } from '@smartweave';
import 'redstone-isomorphic';
import { Readable } from 'stream';
import Parser from 'parse-json-stream';

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

export class RedStoneStreamableInteractionsLoader implements InteractionsLoader {
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
  ): Promise<GQLEdgeInterface[] | Readable> {
    this.logger.debug('Streaming interactions: for ', { contractId, fromBlockHeight, toBlockHeight });

    const stream = new Readable({
      objectMode: true,
      read() {
        // noop
      }
    });

    this.loadData(stream, contractId, fromBlockHeight, toBlockHeight).finally();

    return stream;
  }

  private async loadData(stream: Readable, contractId: string, fromBlockHeight: number, toBlockHeight: number) {
    const result = [];
    let resultChunk = [];
    let chunkBlockHeight = null;
    const logger = this.logger;
    logger.trace(Parser);
    const parser = new Parser(function (error, object) {
      if (error) {
        logger.error(error.message);
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
            stream.push(resultChunk);
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
          stream.push(resultChunk);
        }
        stream.push(null); // end of stream
        logger.debug('Chunks', result.length);
        let totalLength = 0;

        for (const r of result) {
          /*logger.debug(
            r[0].node.block.height + ' - ' + [...r].pop().node.block.height + ' | ' + r.length
          );*/
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
        ...(this.confirmationStatus && this.confirmationStatus.confirmed ? { confirmationStatus: 'confirmed' } : ''),
        ...(this.confirmationStatus && this.confirmationStatus.notCorrupted
          ? { confirmationStatus: 'not_corrupted' }
          : ''),
        ...(this.source ? { source: this.source } : '')
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
