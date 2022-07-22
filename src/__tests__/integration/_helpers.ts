import { Warp } from '@warp';

export async function mineBlock(warp: Warp) {
  await warp.testing.mineBlock();
}
