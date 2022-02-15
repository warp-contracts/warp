/* eslint-disable */
import {GQLEdgeInterface, LoggerFactory, RedstoneStreamableInteractionsLoader} from '../src';
import {TsLogFactory} from '../src/logging/node/TsLogFactory';
import {sleep} from "../../smartweave-tags-encoding/.yalc/redstone-smartweave";

async function main() {
  LoggerFactory.use(new TsLogFactory());

  LoggerFactory.INST.logLevel('debug');

  const streamer = new RedstoneStreamableInteractionsLoader("http://localhost:5666");

  const stream = (await streamer.load(
    'Daj-MNSnH55TDfxqC7v4eq0lKzVIwh98srUaWqyuZtY',
    0,
    866666
  )) as ReadableStream<GQLEdgeInterface[]>;

  const reader = stream.getReader();

  reader.read().then(async function process({ done, value }) {
    // Result objects contain two properties:
    // done  - true if the stream has already given you all its data.
    // value - some data. Always undefined when done is true.
    if (done) {
      console.log("Stream complete");
      return;
    }

    console.log("New chunk in writable: ", value?.length);

    // simulates state evaluation
    await sleep(5);

    // Read some more, and call this function again
    return reader.read().then(process);
  });



}

main().catch((e) => console.error(e));

