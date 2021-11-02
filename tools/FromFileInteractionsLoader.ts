/* eslint-disable */
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
  'nk1IIv4dM8ACzm9fwsxCKjngxWo4yMu6sqYr-Tqmp0I',
  'k0789IzsSppZl3egmQxX_Slx8VmMig4fQJaxyztVSV8',
  'lkjesyJ6Sr_flKak2FKd8As8FW-1k8wygRf8hjkTAfI',
  '2aHIKrdEvu-cUfalvOdcdqq79oVb41PBSgiAXr7epoc',
  '2QQxeYer5mranQLWBKLUGvbwhiqcGucAeB-puYB9hIM',
  '2VHl88d-YQWngGGhyBrluF5VNxY273_uE30AJ0qI_hY',
  '-3h01LpYQEd5bNXUfsSexYr-ak7G0ZPumLArZ-cuJ7I',
  '3qVrnEcApWEeVn4BDzN-aIDrAFIrPPTsQKbXxDYnquc',
  '4a9YiAXCavz22Gn0EFQ1_B9tNpRMUWvzsBeAarzR1c8',
  '50DJFXPa0l0mbjZDgqpghM9mz7CxGKez7kebvI79NJA',
  '7rqrFz3Jr8FZ5LYL2zSZbXrRvSXRwE8lZMpIOecKiag',
  '7sRE3KSkyhUYuU2ZaX-D5Sk5FQ2sF9KucwWZFu877fw',
  '8Fs-aLJgp8diQ5unp-hkli5oTBSDGnvQdIIrzfkCc0E',
  '8Yzk29D2JzwqYmwdA91z_ZqfG1jW2hXX1lhh3HY9fxY',
  '-b8gqnEsZp0AafO6tHTttTliGXu858vqolGs122dsaM',
  '_GR5BE5kae1JkCMUcbecJBuryqNzuAzd8BIVLey4CJA',
  '-k8bLMFysvyjKlakQaffbYyCSlZAGC7ZFq0KjhTVoKU',
  '-Q8A_3JXH3yZms7awAhK2PFCinWfCzm1gvaa6ogi6O4'
];

export class FromFileInteractionsLoader implements InteractionsLoader {
  private readonly logger = LoggerFactory.INST.create('FromFileInteractionsLoader');

  private readonly transactions: GQLEdgeInterface[] = [];

  constructor(filePath: string) {
    const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    this.transactions = (fileContent.cachedValue as GQLEdgeInterface[]).filter((e) => {
      const skip = brokenTransactions.indexOf(e.node.id) >= 0;
      if (skip) {
        this.logger.debug('Skipping', e.node.id);
      }
      return !skip;
    });
  }

  async load(
    contractId: string,
    fromBlockHeight: number,
    toBlockHeight: number,
    evaluationOptions: EvaluationOptions
  ): Promise<GQLEdgeInterface[]> {
    return this.transactions;
  }
}
