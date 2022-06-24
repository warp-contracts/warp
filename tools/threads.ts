/* eslint-disable */
import {LoggerFactory} from '../src';
import { spawn, Thread, Worker } from "threads"

LoggerFactory.INST.logLevel('debug');

async function main() {
  const LOOT_CONTRACT = 'Daj-MNSnH55TDfxqC7v4eq0lKzVIwh98srUaWqyuZtY';
  const warp = await spawn(new Worker("./workers/contract-worker"))
  const result = await warp.readState(LOOT_CONTRACT);
}


main().catch((e) => console.error(e));
