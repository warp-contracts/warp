import { WarpFactory } from '../src';
import { ArweaveSigner, DeployPlugin } from 'warp-contracts-plugin-deploy';
import fs from 'fs';
import path from 'path';

async function main() {
  const warp = WarpFactory.forMainnet().use(new DeployPlugin());
  const wallet = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../.secrets/33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA.json'), 'utf-8')
  );
  const { contractTxId } = await warp.deploy({
    src: fs.readFileSync(path.join(__dirname, '../crates/panic/pkg/rust-contract_bg.wasm')),
    wallet: new ArweaveSigner(wallet),
    initState: JSON.stringify({ x: 0 }),
    wasmGlueCode: path.join(__dirname, '../crates/panic/pkg/rust-contract.js'),
    wasmSrcCodeDir: path.join(__dirname, '../crates/panicsrc')
  });

  console.log(contractTxId);
  const contract = warp.contract(contractTxId).connect(wallet);
  const result = await contract.writeInteraction({ function: 'add', x: 8 });
  console.log(result);

  const { cachedValue } = await contract.readState();
  console.log(cachedValue);
}

main().catch((e) => console.log(e));
