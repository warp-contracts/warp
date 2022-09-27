/* eslint-disable */
import {Level} from "level";

import { MemoryLevel } from 'memory-level';
import fs from "fs";
import {WasmSrc} from "../src";
import {Buffer} from "buffer";

// Create a database


async function test() {
  //const db = new Level<string, any>('./leveldb', {valueEncoding: 'json'});
  const db = new MemoryLevel<string, any>({ valueEncoding: 'json' });
  const wasmSrc = fs.readFileSync('./tools/data/rust/rust-pst_bg.wasm');

  const contractData = {
    src: wasmSrc,
    id: 'n05LTiuWcAYjizXAu-ghegaWjL89anZ6VdvuHcU6dno',
    srcId: 'foobar'
  }

  console.log(contractData);


  await db.put("n05LTiuWcAYjizXAu-ghegaWjL89anZ6VdvuHcU6dno", contractData);
  const result = await db.get("n05LTiuWcAYjizXAu-ghegaWjL89anZ6VdvuHcU6dno");
  console.log(result);
  console.log(Buffer.from(result.src.data));
}

test();
