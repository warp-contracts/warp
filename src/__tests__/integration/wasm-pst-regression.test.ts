/* eslint-disable */
import fs from 'fs';
import path from 'path';
import { interactRead, readContract } from 'smartweave';
import Arweave from 'arweave';
import {
  ContractDefinition, ContractType,
  DefinitionLoader,
  LoggerFactory,
  MemCache,
  RedstoneGatewayContractDefinitionLoader,
  RedstoneGatewayInteractionsLoader,
  SmartWeaveNodeFactory,
  SmartWeaveWebFactory,
  SourceType
} from "@smartweave";

const arweave = Arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
  timeout: 20000,
  logging: false
});

interface ExampleContractState {
  balances: Map<string, number>;
}

LoggerFactory.INST.logLevel('fatal');

const WARP_PST = "KT45jaf8n9UwgkEareWxPgLJk4oMWpI5NODgYVIF1fY";

const END_BLOCK = 870424;

class MockDefinitionLoader implements DefinitionLoader {

  load<State>(contractTxId: string, evolvedSrcTxId?: string): Promise<ContractDefinition<State>> {
    const contractSrc = fs.readFileSync(path.join(__dirname, 'data/wasm/pst.wasm'));
    const initialState = fs.readFileSync(path.join(__dirname, 'data/wasm/warp9-init-state.json'), 'utf8');

    return Promise.resolve({
      txId: WARP_PST,
      srcTxId: WARP_PST,
      src: contractSrc,
      initState: JSON.parse(initialState),
      minFee: "0",
      owner: "GH2IY_3vtE2c0KfQve9_BHoIPjZCS8s5YmSFS_fppKI",
      contractType: 'wasm'
    });
  }

}


describe('readState', () => {
  it('should properly check balance of a PST contract', async () => {

    const smartweaveR = SmartWeaveWebFactory.memCachedBased(arweave, 1)
      .setInteractionsLoader(
        new RedstoneGatewayInteractionsLoader('https://gateway.redstone.finance', null, SourceType.REDSTONE_SEQUENCER)
      )
      .setDefinitionLoader(
        new RedstoneGatewayContractDefinitionLoader('https://gateway.redstone.finance', arweave, new MemCache())
      )
      .build();
    const jsResult = await smartweaveR.contract(WARP_PST).readState();

    const smartweaveR2 = SmartWeaveWebFactory.memCachedBased(arweave, 1)
      .setInteractionsLoader(
        new RedstoneGatewayInteractionsLoader('https://gateway.redstone.finance', null, SourceType.REDSTONE_SEQUENCER)
      )
      .setDefinitionLoader(
        new MockDefinitionLoader()
      )
      .build();
    const wasmResult = await smartweaveR2.contract(WARP_PST).readState();

    expect(wasmResult).toEqual(jsResult);

  }, 600000);
});
