import fs from 'fs';
import path from 'path';

import ArLocal from 'arlocal';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { pack } from 'msgpackr';

import { mineBlock } from '../_helpers';
import { WasmSrc } from '../../../core/modules/impl/wasm/WasmSrc';
import { SmartWeaveTags } from '../../../core/SmartWeaveTags';
import { Warp } from '../../../core/Warp';
import { WarpFactory } from '../../../core/WarpFactory';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { ArweaveWrapper } from '../../../utils/ArweaveWrapper';
import { TagsParser } from '../../../core/modules/impl/TagsParser';
import { SerializationFormat } from '../../../core/modules/StateEvaluator';

import * as Erc1155 from '../data/wasm/rust-erc1155-mspack/types';
import { Contract, WriteInteractionResponse } from 'contract/Contract';

const DEFAULT_TOKEN = 'PTY';
const ARLOCAL_PORT = 1210;

describe('Testing a Rust contract that uses Msgpack as its WASM<->JS serialization format', () => {
  LoggerFactory.INST.logLevel('error');

  let wallet: JWKInterface;
  let walletAddress: string;

  let initialState: Erc1155.State;

  let arlocal: ArLocal;
  let warp: Warp;

  let contractTxId: string;
  let contract: Contract<Erc1155.State>;
  let interact: (input: Erc1155.Action) => Promise<WriteInteractionResponse>;

  let arweaveWrapper: ArweaveWrapper;
  let tagsParser: TagsParser;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(ARLOCAL_PORT, false);
    await arlocal.start();

    warp = WarpFactory.forLocal(ARLOCAL_PORT);
    arweaveWrapper = new ArweaveWrapper(warp.arweave);
    tagsParser = new TagsParser();

    ({ jwk: wallet, address: walletAddress } = await warp.generateWallet());

    const contractSrc = fs.readFileSync(
      path.join(__dirname, '../data/wasm/rust-erc1155-mspack/build/rust-contract_bg.wasm')
    );

    initialState = {
      defaultToken: DEFAULT_TOKEN,
      name: 'TEST-ERC1155-MSGPACK',
      tickerNonce: 0,
      tokens: {
        [DEFAULT_TOKEN]: {
          ticker: DEFAULT_TOKEN,
          balances: {
            [walletAddress]: '200'
          }
        }
      },
      approvals: {},
      settings: {
        allowFreeTransfer: true,
        paused: false,
        proxies: [],
        canEvolve: false,
        operators: [],
        superOperators: []
      }
    };

    // deploying contract using the new SDK.
    contractTxId = (
      await warp.deploy({
        wallet,
        stateFormat: SerializationFormat.MSGPACK,
        initState: pack(initialState),
        src: contractSrc,
        wasmSrcCodeDir: path.join(__dirname, '../data/wasm/rust/src'),
        wasmGlueCode: path.join(__dirname, '../data/wasm/rust/rust-pst.js')
      })
    ).contractTxId;

    contract = warp
      .contract<Erc1155.State>(contractTxId)
      .setEvaluationOptions({ wasmSerializationFormat: SerializationFormat.MSGPACK })
      .connect(wallet);

    interact = async (input: Erc1155.Action) => contract.writeInteraction(input);

    await mineBlock(warp);
  }, 50000);

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should properly deploy contract', async () => {
    const contractTx = await warp.arweave.transactions.get(contractTxId);
    expect(contractTx).not.toBeNull();
    expect(tagsParser.getTag(contractTx, SmartWeaveTags.CONTENT_TYPE)).toEqual(SerializationFormat.MSGPACK);

    const contractSrcTxId = tagsParser.getTag(contractTx, SmartWeaveTags.CONTRACT_SRC_TX_ID);
    const contractSrcTx = await warp.arweave.transactions.get(contractSrcTxId);

    expect(tagsParser.getTag(contractSrcTx, SmartWeaveTags.CONTENT_TYPE)).toEqual('application/wasm');
    expect(tagsParser.getTag(contractSrcTx, SmartWeaveTags.WASM_LANG)).toEqual('rust');
    expect(tagsParser.getTag(contractSrcTx, SmartWeaveTags.WASM_META)).toEqual(JSON.stringify({ dtor: 74 }));

    const srcTxData = await arweaveWrapper.txData(contractSrcTxId);
    const wasmSrc = new WasmSrc(srcTxData);
    expect(wasmSrc.wasmBinary()).not.toBeNull();
    expect(wasmSrc.additionalCode()).toEqual(
      fs.readFileSync(path.join(__dirname, '../data/wasm/rust/rust-pst.js'), 'utf-8')
    );
    expect((await wasmSrc.sourceCode()).size).toEqual(11);
  });

  it('should properly transfer tokens', async () => {
    await interact({ function: 'transfer', qty: '100', to: 'bob' });

    await mineBlock(warp);

    const { state } = (await contract.readState()).cachedValue;

    expect(state.tokens['PTY'].balances[walletAddress]).toEqual('100');
    expect(state.tokens['PTY'].balances['bob']).toEqual('100');
  });
});
