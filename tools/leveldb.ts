/* eslint-disable */
import {Level} from "level";

import { MemoryLevel } from 'memory-level';

// Create a database


async function test() {
  //const db = new Level<string, any>('./leveldb', {valueEncoding: 'json'});
  const db = new MemoryLevel({ valueEncoding: 'json' })

  const contractA = db.sublevel<string, any>('n05LTiuWcAYjizXAu-ghegaWjL89anZ6VdvuHcU6dno', {valueEncoding: 'json'});
  const contractB = db.sublevel<string, any>('NwaSMGCdz6Yu5vNjlMtCNBmfEkjYfT-dfYkbQQDGn5s', {valueEncoding: 'json'});

  await contractA.put("sort_key_01a", {state: "sort_key_01a"});
  await contractA.put("sort_key_01b", {state: "sort_key_01b"});
  await contractA.put("sort_key_02c", {state: "sort_key_02c"});
  await contractA.put("sort_key_03d", {state: "sort_key_03d"});

  await contractB.put("sort_key_01e", {state: "sort_key_01e"});
  await contractB.put("sort_key_01f", {state: "sort_key_01f"});
  await contractB.put("sort_key_02g", {state: "sort_key_02g"});
  await contractB.put("sort_key_03h", {state: "sort_key_03h"});

  /*for await (const value of contractA.values({lt: '02g'})) {
    console.log(value)
  }

  console.log("state: " + (await contractB.get('03h')).state);

  try {
    (await contractB.get('06h'));
  } catch (e: any) {
    console.log(e.code);
  }

  const keys = await contractB.keys({reverse: true, limit: 1}).all();
  console.log(keys.length);
  console.log(keys);


  db.iterator().seek('zzz');
  const result = await db.iterator().next();
  console.log('result last', result);

  const entries = await db.iterator({ limit: 10, reverse: true }).all()

  console.log('last entries');
  for (const [key, value] of entries) {
    console.log(key);
  }*/

  //console.log(contractA.prefix) // '!example!'


  const contracts = [];

  let lastSortKey = '';


  /*for (const key of await db.keys().all()) {
    console.log(key);
    const sortKey = key.substring(45);
    console.log(key.substring(45));
    if (sortKey.localeCompare(lastSortKey) > 0) {
      lastSortKey = sortKey;
    }
  }

  console.log({lastSortKey});*/

  const keys = await db.keys().all();

  const result = new Set<string>();
  keys.forEach((k) => result.add(k.substring(1, 44)));

  console.log(Array.from(result));

  // returns sub-levels - i.e. contracts
  // console.log(keys.map((k) => k.substring(1, 44)));

}

test();
