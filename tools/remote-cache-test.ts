/* eslint-disable */
import { RemoteBlockHeightCache } from '../src/cache/impl/RemoteBlockHeightCache';

async function main() {
  const cache = new RemoteBlockHeightCache(
    "STATE", "http://localhost:3000"
  );

  const get = await cache.get('txId', 557);
  console.log('get result:', get);

  const getLessOrEqual = await cache.getLessOrEqual('txId', 600);
  console.log('getLessOrEqual result:', getLessOrEqual);

  const contains = await cache.contains('txId');
  console.log('contains result:', contains);

  const getLast = await cache.getLast('txId');
  console.log('getLast result:', getLast);

  await cache.put({cacheKey: 'txId', blockHeight: 558}, {
    "value": "toBeCached"
  });

  const getLastAfterPut = await cache.getLast('txId');
  console.log('getLastAfterPut result:', getLastAfterPut);
}


main().catch((e) => {
  console.log(e);
});
