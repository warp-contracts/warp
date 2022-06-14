/* eslint-disable */
import {Level} from "level";

import { MemoryLevel } from 'memory-level';

// Create a database


async function test() {
  const db = new Level<string, any>('./leveldb', {valueEncoding: 'json'});
  const dbMem = new MemoryLevel({ valueEncoding: 'json' })

  const contractA = dbMem.sublevel<string, any>('contract_a', {valueEncoding: 'json'});
  const contractB = dbMem.sublevel<string, any>('contract_b', {valueEncoding: 'json'});
  const contractC = dbMem.sublevel<string, any>('contract_c', {valueEncoding: 'json'});

  contractA.put("01a", {state: "01a"});
  contractA.put("01b", {state: "01b"});
  contractA.put("02c", {state: "02c"});
  contractA.put("03d", {state: "03d"});

  contractB.put("01e", {state: "01e"});
  contractB.put("01f", {state: "01f"});
  contractB.put("02g", {state: "02g"});
  contractB.put("03h", {state: "03h"});

  for await (const value of contractA.values({lt: '02g'})) {
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


}

test();
