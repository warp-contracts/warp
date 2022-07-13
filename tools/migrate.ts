/* eslint-disable */
import Arweave from 'arweave';
import {defaultCacheOptions, defaultWarpGwOptions, LoggerFactory, WarpFactory} from '../src';

LoggerFactory.INST.logLevel('debug');

async function main() {
  const arweave = Arweave.init({
    host: 'arweave.net', // Hostname or IP address for a Arweave host
    port: 443, // Port
    protocol: 'https', // Network protocol http or https
    timeout: 60000, // Network request timeouts in milliseconds
    logging: false // Enable network request logging
  });

  const warp = WarpFactory.forMainnet({
    ...defaultCacheOptions,
    dbLocation: './tools/.leveldb'
  });

  const result = await warp.migrationTool.migrateSqlite("./tools/sqlite/contracts-3008.sqlite");

  console.log(result);

  const dump = await warp.stateEvaluator.dumpCache();

  console.log(dump);
}


main().catch((e) => console.error(e));
