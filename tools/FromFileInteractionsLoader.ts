import { InteractionsLoader } from '../src/core/modules/InteractionsLoader';
import { GQLEdgeInterface } from '../src/legacy/gqlResult';
import * as fs from 'fs';
import { LoggerFactory } from '../src';

const brokenTransactions = [
  '3O5Nvfbj72BDJT2bDC5EUm6gmkManJADsn93vKzQISU',
  '6uNZj-IV5sDx2Rpe7E2Jh_8phHzmDwts771mwbbuZc4',
  'oQt1SJz5dxNxyjYBMPCsthUR0OyhTLTwrnNH9rbcOE4',
  't2LOZSWW8u4G8a8gQqIoN9MdczQb7mIflPuQG7MGgtU',
  'v6bGNzNMTb7fj_q_KwRyLH2pSN6rSmPzHXUvrfDPYHs',
  'vofahl_F506NkD6dP-1gYis-1N6sWQnfcXazDhoKaiQ',
  'z2fZzeB_466S9kTikjA2RihwEuBVUUe9FAceYj_KKtA',
]

export class FromFileInteractionsLoader implements InteractionsLoader {
  private readonly logger = LoggerFactory.INST.create('FromFileInteractionsLoader');

  private readonly transactions: GQLEdgeInterface[] = [];

  constructor(filePath: string) {
    const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    this.transactions = (fileContent.cachedValue as GQLEdgeInterface[]).filter(e => {
      const skip = brokenTransactions.indexOf(e.node.id) >= 0
      if (skip) {
        this.logger.debug('Skipping', e.node.id);
      }
      return !skip;
    });
  }

  async load(contractId: string, fromBlockHeight: number, toBlockHeight: number): Promise<GQLEdgeInterface[]> {
    return this.transactions;
  }
}
