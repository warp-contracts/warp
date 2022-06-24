/* eslint-disable */
import fs from 'fs';
import path from 'path';
import { interactRead, readContract } from 'smartweave';
import Arweave from 'arweave';
import { LoggerFactory, WarpNodeFactory, WarpWebFactory, SourceType } from '@warp';

const stringify = require('safe-stable-stringify');

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
  timeout: 30000,
  logging: false
});

LoggerFactory.INST.logLevel('fatal');

const testCases: string[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-cases/read-state.json'), 'utf-8'));
const testCasesGw: string[] = JSON.parse(fs.readFileSync(path.join(__dirname, 'test-cases/gateways.json'), 'utf-8'));
const testCasesVm: string[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'test-cases/read-state-vm.json'), 'utf-8')
);

const chunked: string[][][] = [...chunks(testCases, 10)];
const chunkedGw: string[][][] = [...chunks(testCasesGw, 10)];
const chunkedVm: string[][][] = [...chunks(testCasesVm, 10)];

const originalConsoleLog = console.log;

describe.each(chunked)('v1 compare.suite %#', (contracts: string[]) => {
  // note: concurrent doesn't seem to be working here, duh...
  // will probably need to manually split all the test cases to separate test files
  it.each(contracts)(
    '.test %# %o',
    async (contractTxId: string) => {
      const blockHeight = 850127;
      console.log('readContract', contractTxId);
      const resultString = fs
        .readFileSync(path.join(__dirname, 'test-cases', 'contracts', `${contractTxId}.json`), 'utf-8')
        .trim();
      console.log('readState', contractTxId);
      try {
        console.log = function () {}; // to hide any logs from contracts...
        const result2 = await WarpNodeFactory.memCachedBased(arweave, 1)
          .useWarpGateway(null, SourceType.ARWEAVE)
          .build()
          .contract(contractTxId)
          .setEvaluationOptions({
            useFastCopy: true,
            allowUnsafeClient: true
          })
          .readState(blockHeight);
        const result2String = stringify(result2.state).trim();
        expect(result2String).toEqual(resultString);
      } finally {
        console.log = originalConsoleLog;
      }
    },
    300 * 1000
  );
});

describe.each(chunkedVm)('v1 compare.suite (VM2) %#', (contracts: string[]) => {
  it.each(contracts)(
    '.test %# %o',
    async (contractTxId: string) => {
      const blockHeight = 850127;
      console.log('readContract', contractTxId);
      const resultString = fs
        .readFileSync(path.join(__dirname, 'test-cases', 'contracts', `${contractTxId}.json`), 'utf-8')
        .trim();
      console.log('readState', contractTxId);
      const result2 = await WarpNodeFactory.memCachedBased(arweave, 1)
        .useWarpGateway(null, SourceType.ARWEAVE)
        .build()
        .contract(contractTxId)
        .setEvaluationOptions({
          useFastCopy: true,
          useIVM: true,
          allowUnsafeClient: true,
          ivm: {
            memoryLimit: 120
          }
        })
        .readState(blockHeight);
      const result2String = stringify(result2.state).trim();
      expect(result2String).toEqual(resultString);
    },
    300 * 1000
  );
});

describe.each(chunkedGw)('gateways compare.suite %#', (contracts: string[]) => {
  // note: concurrent doesn't seem to be working here, duh...
  // will probably need to manually split all the test cases to separate test files
  it.each(contracts)(
    '.test %# %o',
    async (contractTxId: string) => {
      const blockHeight = 855134;
      console.log('readState Warp Gateway', contractTxId);
      const warpR = WarpWebFactory.memCachedBased(arweave, 1).useWarpGateway(null, SourceType.ARWEAVE).build();
      const result = await warpR.contract(contractTxId).readState(blockHeight);
      const resultString = stringify(result.state).trim();

      console.log('readState Arweave Gateway', contractTxId);
      const result2 = await WarpNodeFactory.memCachedBased(arweave, 1)
        .useArweaveGateway()
        .build()
        .contract(contractTxId)
        .readState(blockHeight);
      const result2String = stringify(result2.state).trim();
      expect(result2String).toEqual(resultString);
    },
    300 * 1000
  );
});

describe('readState', () => {
  it(
    'should properly read state at requested block height',
    async () => {
      const contractTxId = 'CbGCxBJn6jLeezqDl1w3o8oCSeRCb-MmtZNKPodla-0';
      const blockHeight = 707892;
      const result = await readContract(arweave, contractTxId, blockHeight);
      const resultString = stringify(result).trim();

      const result2 = await WarpNodeFactory.memCachedBased(arweave, 1)
        .useWarpGateway(null, SourceType.ARWEAVE)
        .build()
        .contract(contractTxId)
        .setEvaluationOptions({
          allowUnsafeClient: true
        })
        .readState(blockHeight);
      const result2String = stringify(result2.state).trim();

      expect(result2String).toEqual(resultString);
    },
    300 * 1000
  );

  it(
    'should properly check balance of a PST contract',
    async () => {
      const jwk = await arweave.wallets.generate();
      const contractTxId = '-8A6RexFkpfWwuyVO98wzSFZh0d6VJuI-buTJvlwOJQ';
      const v1Result = await interactRead(arweave, jwk, contractTxId, {
        function: 'balance',
        target: '6Z-ifqgVi1jOwMvSNwKWs6ewUEQ0gU9eo4aHYC3rN1M'
      });

      const v2Result = await WarpNodeFactory.memCachedBased(arweave, 1)
        .useWarpGateway(null, SourceType.ARWEAVE)
        .build()
        .contract(contractTxId)
        .connect(jwk)
        .viewState({
          function: 'balance',
          target: '6Z-ifqgVi1jOwMvSNwKWs6ewUEQ0gU9eo4aHYC3rN1M'
        });

      expect(v1Result).toEqual(v2Result.result);
    },
    300 * 1000
  );
});
