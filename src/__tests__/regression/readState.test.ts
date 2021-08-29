import fs from 'fs';
import path from 'path';
import { readContract } from 'smartweave';
import Arweave from 'arweave';
import { LoggerFactory, SmartWeaveNodeFactory } from '@smartweave';

function* chunks(arr, n) {
  for (let i = 0; i < arr.length; i += n) {
    // note: wrapping with an array to make it compatible with describe.each
    yield [arr.slice(i, i + n)];
  }
}

const arweave = Arweave.init({
  host: 'dh48zl0solow5.cloudfront.net',
  port: 443,
  protocol: 'https',
  timeout: 60000,
  logging: false
});

const smartWeave = SmartWeaveNodeFactory.memCached(arweave);

const testCases: string[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-cases.json'), 'utf-8'));

const chunked: string[][][] = [...chunks(testCases, 10)];

LoggerFactory.INST.logLevel('info');

describe.each(chunked)('.suite %#', (contracts: string[]) => {
  // note: concurrent doesn't seem to be working here, duh...
  // will probably need to manually split all the test cases to separate test files
  it.concurrent.each(contracts)(
    '.test %# %o',
    async (contractTxId: string) => {
      console.log('readContract', contractTxId);
      const result = await readContract(arweave, contractTxId);
      const resultString = JSON.stringify(result).trim();

      const result2 = await smartWeave.contract(contractTxId).readState();
      const result2String = JSON.stringify(result2.state).trim();

      expect(result2String).toEqual(resultString);
    },
    600000
  );
});
