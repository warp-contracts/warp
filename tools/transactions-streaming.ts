/* eslint-disable */
import {LoggerFactory, RedStoneStreamableInteractionsLoader} from '../src';
import {TsLogFactory} from '../src/logging/node/TsLogFactory';
import {DefaultEvaluationOptions} from '../src/core/modules/StateEvaluator';
import {Readable, Stream} from "stream";
import {sleep} from "../../smartweave-tags-encoding/.yalc/redstone-smartweave";

async function main() {
  LoggerFactory.use(new TsLogFactory());

  LoggerFactory.INST.logLevel('debug');

  const streamer = new RedStoneStreamableInteractionsLoader("http://localhost:5666");

  const stream = (await streamer.load(
    'Daj-MNSnH55TDfxqC7v4eq0lKzVIwh98srUaWqyuZtY',
    0,
    866666
  )) as Readable;

  const writable = new Stream.Writable({objectMode: true});
  stream.pipe(writable)
  writable._write = async (object, encoding, done) => {
    console.log("New chunk in writable: ", object.length);

    // simulates state evaluation
    await sleep(100);

    done();
  }

}

main().catch((e) => console.error(e));

