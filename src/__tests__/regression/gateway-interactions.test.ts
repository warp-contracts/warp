/* eslint-disable */
import fs from 'fs';
import path from 'path';
import Arweave from 'arweave';
import {
  LoggerFactory,
  RedstoneGatewayInteractionsLoader,
  ArweaveGatewayInteractionsLoader,
  DefaultEvaluationOptions,
  GQLEdgeInterface
} from '@smartweave';

/* 
TODO: two test cases have been removed from the list - gateway-interaction test is failing due to the different
amount of interactions returned from Redstone gateway and Arweave GQL gateway
should be fixed in https://github.com/redstone-finance/redstone-sw-gateway/issues/17, following cases should be
then added to ../test-cases/gateway-interactions.json
"eWB7FHyPyCYnkcbK1aINbAQ9YYTDhKGkS7lDiNPZ5Mg",
"cpXtKvM0e6cqAgjv-BCfanWQmYGupECt1MxRk1N9Mjk"
*/

const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
  timeout: 600000,
  logging: false
});

LoggerFactory.INST.logLevel('fatal');

const testCases: string[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'test-cases/gateway-interactions.json'), 'utf-8')
);

/**
 * These regression tests should verify whether {@link ArweaveGatewayInteractionsLoader}
 * and {@link RedstoneGatewayInteractionsLoader} return same results for given variables.
 */
describe.each([750000, 775000, 800000, 825000, 850000])('testing for block height %d', (toBlockHeight) => {
  it('returns same amount of interactions for the same block height', async () => {
    console.log('toBlockHeight', toBlockHeight);
    const redstoneInteractionsLoader = new RedstoneGatewayInteractionsLoader('https://gateway.redstone.finance/');
    const arweaveInteractionsLoader = new ArweaveGatewayInteractionsLoader(arweave);
    const responseRedstoneInteractionsLoader: GQLEdgeInterface[] = await redstoneInteractionsLoader.load(
      'Daj-MNSnH55TDfxqC7v4eq0lKzVIwh98srUaWqyuZtY',
      0,
      toBlockHeight
    );
    const responseArweaveInteractionsLoader: GQLEdgeInterface[] = await arweaveInteractionsLoader.load(
      'Daj-MNSnH55TDfxqC7v4eq0lKzVIwh98srUaWqyuZtY',
      0,
      toBlockHeight,
      new DefaultEvaluationOptions()
    );

    expect(responseRedstoneInteractionsLoader.length).toEqual(responseArweaveInteractionsLoader.length);
  }, 600000);
});

describe.each(testCases)('testing contractId %s', (contractTxId) => {
  it('returns same interactions ids for RedstoneGatewayLoader and ArweaveGatewayInteractionsLoader', async () => {
    const redstoneInteractionsLoader = new RedstoneGatewayInteractionsLoader('https://gateway.redstone.finance');
    const arweaveInteractionsLoader = new ArweaveGatewayInteractionsLoader(arweave);
    const responseRedstoneInteractionsLoader: GQLEdgeInterface[] = await redstoneInteractionsLoader.load(
      contractTxId,
      0,
      8301901
    );
    const responseArweaveInteractionsLoader: GQLEdgeInterface[] = await arweaveInteractionsLoader.load(
      contractTxId,
      0,
      8301901,
      new DefaultEvaluationOptions()
    );

    expect(responseRedstoneInteractionsLoader.length).toEqual(responseArweaveInteractionsLoader.length);

    let arr = [];
    responseRedstoneInteractionsLoader.forEach((resRedstone) => {
      arr.push(
        responseArweaveInteractionsLoader.find((resArweave) => resArweave.node.id === resRedstone.node.id) !== undefined
      );
    });
    const result = arr.every((a) => a === true);

    expect(result).toEqual(true);
  }, 600000);
});
