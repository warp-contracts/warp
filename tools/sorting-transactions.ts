/* eslint-disable */
import Arweave from 'arweave';
import {
  LexicographicalInteractionsSorter,
  LoggerFactory,
} from '../src';

async function main() {
  const arweave = Arweave.init({
    host: 'arweave.net',
    port: 443,
    protocol: 'https'
  });



  const lexSorting = new LexicographicalInteractionsSorter(arweave);

  const sortKey = await lexSorting.createSortKey("cYHg6-C08kC7gNFlYleYOzEs2USbNe0-U4z3pXVmC8lIyN558PDp5_EHJMkBB2E4", "GqC7NKb_QXjFqE0NMU5DUfD4dP72k78s7LoxVImKwS4", 1241222);

  console.log(sortKey);

}

main().catch((e) => console.error(e));
