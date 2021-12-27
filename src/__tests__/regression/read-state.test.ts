/* eslint-disable */
import fs from 'fs';
import path from 'path';
import { interactRead, readContract } from 'smartweave';
import Arweave from 'arweave';
import { LoggerFactory, SmartWeaveNodeFactory } from '@smartweave';

function* chunks(arr, n) {
  for (let i = 0; i < arr.length; i += n) {
    // note: wrapping with an array to make it compatible with describe.each
    yield [arr.slice(i, i + n)];
  }
}

const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
  timeout: 60000,
  logging: false
});

LoggerFactory.INST.logLevel('fatal');

const testCases: string[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-cases/read-state.json'), 'utf-8'));

const chunked: string[][][] = [...chunks(testCases, 10)];

describe.each(chunked)('.suite %#', (contracts: string[]) => {
  // note: concurrent doesn't seem to be working here, duh...
  // will probably need to manually split all the test cases to separate test files
  it.concurrent.each(contracts)(
    '.test %# %o',
    async (contractTxId: string) => {
      console.log('readContract', contractTxId);
      const result = await readContract(arweave, contractTxId);
      const resultString = JSON.stringify(result).trim();
      console.log('readState', contractTxId);
      const result2 = await SmartWeaveNodeFactory.memCached(arweave, 1).contract(contractTxId).readState();
      const result2String = JSON.stringify(result2.state).trim();
      expect(result2String).toEqual(resultString);
    },
    600000
  );
});

describe('readState', () => {
  it('should properly read state at requested block height', async () => {
    const contractTxId = 'CbGCxBJn6jLeezqDl1w3o8oCSeRCb-MmtZNKPodla-0';
    const blockHeight = 707892;
    const result = await readContract(arweave, contractTxId, blockHeight);
    const resultString = JSON.stringify(result).trim();

    const result2 = await SmartWeaveNodeFactory.memCached(arweave, 1)
      .contract(contractTxId)
      .setEvaluationOptions({ updateCacheForEachInteraction: false })
      .readState(blockHeight);
    const result2String = JSON.stringify(result2.state).trim();

    expect(result2String).toEqual(resultString);
  });

  it('should properly check balance of a PST contract', async () => {
    const jwk = await arweave.wallets.generate();
    const contractTxId = '-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ';
    const v1Result = await interactRead(arweave, jwk, contractTxId, {
      function: 'balance',
      target: '6Z-ifqgVi1jOwMvSNwKWs6ewUEQ0gU9eo4aHYC3rN1M'
    });

    const v2Result = await SmartWeaveNodeFactory.memCached(arweave, 1)
      .contract(contractTxId)
      .setEvaluationOptions({ updateCacheForEachInteraction: false })
      .connect(jwk)
      .viewState({
        function: 'balance',
        target: '6Z-ifqgVi1jOwMvSNwKWs6ewUEQ0gU9eo4aHYC3rN1M'
      });

    expect(v1Result).toEqual(v2Result.result);
  }, 600000);
});
