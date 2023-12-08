/* eslint-disable */
import {defaultCacheOptions, LoggerFactory, WarpFactory} from '../src';

const logger = LoggerFactory.INST.create('Contract');


LoggerFactory.INST.logLevel('error');
LoggerFactory.INST.logLevel('debug', 'HandlerBasedContract');
LoggerFactory.INST.logLevel('debug', 'CacheableStateEvaluator');


async function main() {
  const heapUsedBefore = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
  const rssUsedBefore = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;

  const warp = WarpFactory
    .forMainnet({ ...defaultCacheOptions, inMemory: true });

  try {

    const signal = AbortSignal.timeout(2000);
    const contract = warp
      .contract("Daj-MNSnH55TDfxqC7v4eq0lKzVIwh98srUaWqyuZtY")
      .setEvaluationOptions({
        maxCallDepth: 5,
        maxInteractionEvaluationTimeSeconds: 10000,
        allowBigInt: true,
        unsafeClient: 'skip',
      });
    const result = await contract.readStateBatch(1, signal);
    console.dir(result.cachedValue.state, {depth: null});
  } catch (e) {
    console.error(e);
  }

  const heapUsedAfter = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
  const rssUsedAfter = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;
  logger.warn('Heap used in MB', {
    usedBefore: heapUsedBefore,
    usedAfter: heapUsedAfter
  });

  logger.info('RSS used in MB', {
    usedBefore: rssUsedBefore,
    usedAfter: rssUsedAfter
  });

  return;
}


main().catch((e) => console.error(e));
