import { TrieLevel } from '../../src/cache/impl/TrieLevel';
import { Trie } from '@ethereumjs/trie';
import { Level } from 'level';
import { PerformanceObserver } from 'perf_hooks';
import fs from 'fs';

const DB_SIZE_SAMPLES = [1_000, 10_000, 100_000, 1_000_000];
const DB_ITEMS_FETCH_UPDATE = 1_000;
const DB_PATH = `./tools/measure/kv/TRIE_TEST_`;

interface Measurement {
  time: number;
  heap: number;
  rss: number;
  gcTime: number;
  callbackResult: any | null;
}

interface MeasurementCases {
  sample: number;
  init: Measurement;
  insert: Measurement;
  get: Measurement;
  update: Measurement;
}

/**
 * The following script will run all test cases if no arguments specified.
 * Here is some example of parametrised single test usage:
 * for i in {1000, 10000, 100000, 1000000}; do node --max_old_space_size=8192 -r ts-node/register trie-and-measure-mets.ts >> stats_01_09_v9.csv ${i} trie; done
 * for i in {1000, 10000, 100000, 1000000}; do node --max_old_space_size=8192 -r ts-node/register trie-and-measure-mets.ts >> stats_01_09_v9.csv ${i} level; done
 */
async function main() {
  if (process.argv.length > 2) {
    const size = Number(process.argv[2]);
    const type = process.argv[3];
    await testOne(size, type);
  } else {
    await testAll();
  }

  try {
    fs.rmSync('./kv', { recursive: true, force: true });
  } catch (error) {
    console.error(error);
  }
}

async function testOne(size: number, type: string) {
  const dict = {
    trie: createTrie,
    level: createLevelDB
  };
  const abstractMeasurements = [];
  abstractMeasurements.push(await setupAndRunTestCase(size, dict[type]));
  printMeasurements(abstractMeasurements);
}

async function testAll() {
  console.log(`---- TEST CASES FOR -- Trie -- `);
  const trieMeasurements = [];
  for (const size of DB_SIZE_SAMPLES) {
    trieMeasurements.push(await setupAndRunTestCase(size, createTrie));
  }
  printMeasurements(trieMeasurements);

  console.log(`\n\n---- TEST CASES FOR -- AbstractLevel`);
  const abstractMeasurements = [];
  for (const size of DB_SIZE_SAMPLES) {
    abstractMeasurements.push(await setupAndRunTestCase(size, createLevelDB));
  }

  printMeasurements(abstractMeasurements);
}

async function setupAndRunTestCase(elementsCount: number, createDB: (name: string) => any): Promise<MeasurementCases> {
  const dbName = DB_PATH + elementsCount + createDB.name;
  return await treeTest(elementsCount, dbName, createDB);
}

async function treeTest(size: number, dbName: string, createDB: (name: string) => any): Promise<MeasurementCases> {
  const mmInit = await measures(size, 'Init createDB', () => createDB(dbName));
  const sut = mmInit.callbackResult;
  const mmInsert = await measures(size, 'Insert items', async () => insertItems(size, sut));

  const randomKeys = getRandomArray(DB_ITEMS_FETCH_UPDATE, size);

  const mmGet = await measures(size, 'Get random items', async () => randomGetAndStore(randomKeys, sut));
  const mmUpdate = await measures(size, 'Update random items', async () => randomUpdate(randomKeys, sut));

  return {
    sample: size,
    init: mmInit,
    insert: mmInsert,
    get: mmGet,
    update: mmUpdate
  };
}

function createTrie(dbName: string) {
  return new Trie({ db: new TrieLevel(new Level(dbName)) });
}

function createLevelDB(dbName: string) {
  return new TrieLevel(new Level(dbName));
}

async function insertItems(size: number, db: Trie) {
  for (const key of Array(size).keys()) {
    await db.put(Buffer.from(`${key}`), Buffer.from(`LeafContent ${key} at ${Date.now()}`));
  }
}

async function randomGetAndStore(keys: number[], db: Trie) {
  for (const key of keys.values()) {
    await db.get(Buffer.from(`${key}`));
  }
}

async function randomUpdate(keys: number[], db: Trie) {
  for (const key of keys.values()) {
    await db.put(Buffer.from(`${key}`), Buffer.from(`LeafContent updated at: ${Date.now()}`));
  }
}

function getRandomArray(size: number, maxVal: number) {
  return [...new Array(size)].map(() => Math.round(Math.random() * (maxVal - 1)));
}

async function measures(trieCount: number, name: string, callback: () => any): Promise<Measurement> {
  const gcObserver = startGCObserver();
  const memHeap = measureHeap();
  const memRss = measureRss();
  const startTime = performance.now();

  const result = await callback();

  const endTime = performance.now();
  const rssDiff = memRss.diff();
  const heapDiff = memHeap.diff();
  return {
    heap: heapDiff,
    rss: rssDiff,
    time: endTime - startTime,
    gcTime: gcObserver.diff(),
    callbackResult: result
  };
}

function measureHeap() {
  const heapUsedBefore = Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100;
  return {
    diff: () => Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100 - heapUsedBefore
  };
}

function measureRss() {
  const rssUsedBefore = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;
  return {
    diff: () => Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100 - rssUsedBefore
  };
}

function startGCObserver() {
  let gcTime = 0;
  const obs = new PerformanceObserver((list) => {
    gcTime += list.getEntries()[0].duration;
  });
  obs.observe({ entryTypes: ['gc'] });
  return {
    diff: () => {
      obs.disconnect();
      return gcTime;
    }
  };
}

function printMeasurements(measurements: MeasurementCases[]) {
  console.log(
    `, sample, \
    init time [ms], init heap [MB], init rss [MB],, \
    insert time [ms], insert heap [MB], insert rss [MB],, \
    get time [ms], get heap [MB], get rss [MB],, \
    update time [ms], update heap [MB], update rss [MB]
    `
  );
  for (const ms of measurements) {
    console.log(`,${ms.sample},\
    ${ms.init.time}, ${ms.init.heap}, ${ms.init.rss},,\
    ${ms.insert.time}, ${ms.insert.heap}, ${ms.insert.rss},,\
    ${ms.get.time}, ${ms.get.heap}, ${ms.get.rss},,\
    ${ms.update.time}, ${ms.update.heap}, ${ms.update.rss}\
    `);
  }
}

main();
