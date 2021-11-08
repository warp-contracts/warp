/* eslint-disable */
import Arweave from 'arweave';
import { LoggerFactory } from '../src';
import { TsLogFactory } from '../src/logging/node/TsLogFactory';
import { MemBlockHeightSwCache } from '../src/cache/impl/MemBlockHeightCache';

type Cache = {
  ticker: string;
  totalSupply: number;
};

async function main() {
  LoggerFactory.use(new TsLogFactory());

  LoggerFactory.INST.logLevel('debug');

  const objectCache = new MemBlockHeightSwCache<Cache>();
  const arrayCache = new MemBlockHeightSwCache<Array<Cache>>();

  console.time('benchmark_object');
  for (let i = 0; i < 10_000_000; i++) {
    await objectCache.put(
      { cacheKey: '' + i, blockHeight: i },
      {
        ticker: 'RDST',
        totalSupply: i
      }
    );
  }
  console.timeEnd('benchmark_object');

  console.time('benchmark_array');
  const o = {};
  for (let i = 0; i < 10_000_000; i++) {
    await arrayCache.put({ cacheKey: '' + i, blockHeight: i }, [
      {
        ticker: 'RDST',
        totalSupply: i
      }
    ]);
  }
  console.timeEnd('benchmark_array');
  console.log(Object.keys(o).length);
}

main().catch((e) => console.error(e));
