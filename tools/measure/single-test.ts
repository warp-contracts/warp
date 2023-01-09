import { TrieLevel } from "../../src/cache/impl/TrieLevel";
import { Level } from "level";
import { Benchmark } from "../../src";
import { Trie } from "@ethereumjs/trie";

async function single() {
  const db = new TrieLevel(new Level(
    `./tools/measure/kv/TRIE_TEST1000000createAbstractLevel/`
  ));

  const benchmark = Benchmark.measure();
  await db.put(Buffer.from(Date.now() + ''), Buffer.from(Date.now() + ''));
  console.log(benchmark.elapsed());

  benchmark.reset();
  await db.put(Buffer.from(Date.now() + ''), Buffer.from(Date.now() + ''));
  console.log(benchmark.elapsed());

  benchmark.reset();
  await db.put(Buffer.from(Date.now() + ''), Buffer.from(Date.now() + ''));
  console.log(benchmark.elapsed());

  benchmark.reset();
  await db.put(Buffer.from(Date.now() + ''), Buffer.from(Date.now() + ''));
  console.log(benchmark.elapsed());

  benchmark.reset();
  await db.put(Buffer.from(Date.now() + ''), Buffer.from(Date.now() + ''));
  console.log(benchmark.elapsed());

  benchmark.reset();
  await db.put(Buffer.from(Date.now() + ''), Buffer.from(Date.now() + ''));
  console.log(benchmark.elapsed());

}


async function singleTrie() {
  const db = new Trie({db: new TrieLevel(new Level(
    `./tools/measure/kv/TRIE_TEST1000000createTrie/`
  ))});

  const benchmark = Benchmark.measure();
  await db.put(Buffer.from(Date.now() + ''), Buffer.from(Date.now() + ''));
  console.log(benchmark.elapsed());

  benchmark.reset();
  await db.put(Buffer.from(Date.now() + ''), Buffer.from(Date.now() + ''));
  console.log(benchmark.elapsed());

  benchmark.reset();
  await db.put(Buffer.from(Date.now() + ''), Buffer.from(Date.now() + ''));
  console.log(benchmark.elapsed());

  benchmark.reset();
  await db.put(Buffer.from(Date.now() + ''), Buffer.from(Date.now() + ''));
  console.log(benchmark.elapsed());

  benchmark.reset();
  await db.put(Buffer.from(Date.now() + ''), Buffer.from(Date.now() + ''));
  console.log(benchmark.elapsed());

  benchmark.reset();
  await db.put(Buffer.from(Date.now() + ''), Buffer.from(Date.now() + ''));
  console.log(benchmark.elapsed());

}

singleTrie().then(() => console.log("done"));