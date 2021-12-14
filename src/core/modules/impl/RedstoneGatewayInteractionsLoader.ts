import { Benchmark, InteractionsLoader, LoggerFactory } from '@smartweave';
import { GQLEdgeInterface, GQLNodeInterface } from 'legacy/gqlResult';
import 'isomorphic-fetch';
interface Paging {
  total: string;
  limit: number;
  items: number;
  page: number;
  pages: number;
}

interface Interaction {
  status: string;
  confirming_peers: string;
  confirmations: string;
  interaction: GQLNodeInterface;
}

export interface RedstoneGatewayInteractions {
  paging: Paging;
  interactions: Interaction[];
  message?: string;
}

type ConfirmationStatus =
  | {
      notCorrupted?: boolean;
      confirmed?: null;
    }
  | {
      notCorrupted?: null;
      confirmed?: boolean;
    };

/**
 * The aim of this implementation of the {@link InteractionsLoader} is to make use of Redstone Gateway endpoint
 * and retrieve contracts' interactions. Optionally - it is possible to pass skipOrphans flag in the constructor
 * and therefore receive only these transactions which are confirmed. To learn more about Redstone Gateway please visit
 * {@link https://github.com/redstone-finance/redstone-sw-gateway}.
 * Please note that currently caching is switched off for RedstoneGatewayInteractionsLoader due to the issue mentioned in the
 * following comment {@link https://github.com/redstone-finance/redstone-smartcontracts/pull/62#issuecomment-995249264}
 */
export class RedstoneGatewayInteractionsLoader implements InteractionsLoader {
  constructor(private readonly baseUrl: string, private readonly confirmationStatus: ConfirmationStatus = {}) {
    Object.assign(this, confirmationStatus);
  }

  private readonly logger = LoggerFactory.INST.create('RedstoneGatewayInteractionsLoader');

  async load(contractId: string, fromBlockHeight: number, toBlockHeight: number): Promise<GQLEdgeInterface[]> {
    this.logger.debug('Loading interactions: for ', { contractId, fromBlockHeight, toBlockHeight });

    const interactions: GQLEdgeInterface[] = [];
    let page = 0;
    let totalPages = 0;

    const benchmarkTotalTime = Benchmark.measure();
    do {
      const benchmarkRequestTime = Benchmark.measure();
      const response = await fetch(
        `${this.baseUrl}/gateway/interactions?${new URLSearchParams({
          contractId: contractId,
          from: fromBlockHeight.toString(),
          to: toBlockHeight.toString(),
          page: (++page).toString(),
          ...(this.confirmationStatus.confirmed ? { confirmationStatus: 'confirmed' } : ''),
          ...(this.confirmationStatus.notCorrupted ? { confirmationStatus: 'not_corrupted' } : '')
        })}`
      )
        .then((res) => {
          if (res.ok) {
            return res.json();
          } else {
            return Promise.reject(res);
          }
        })
        .then((data) => {
          return data;
        })
        .catch((error) => {
          if (error.body?.message) {
            this.logger.error(error.body.message);
          }
          throw new Error(`Unable to retrieve transactions. Redstone gateway responded with status ${error.status}.`);
        });
      this.logger.debug(`Loading interactions: page ${page}, time: `, benchmarkRequestTime.elapsed());

      totalPages = response.paging.pages;

      this.logger.debug(`Loading interactions: page ${page} of ${totalPages} loaded`);

      response.interactions.forEach((interaction) =>
        interactions.push({
          cursor: '',
          node: interaction.interaction
        })
      );

      this.logger.debug(`Loaded interactions length: ${interactions.length}`);
    } while (page < totalPages);

    this.logger.debug(`Loading interactions for ${contractId}:`, benchmarkTotalTime.elapsed());

    this.logger.debug('All loaded interactions:', {
      from: fromBlockHeight,
      to: toBlockHeight,
      loaded: interactions.length
    });

    return interactions;
  }
}
