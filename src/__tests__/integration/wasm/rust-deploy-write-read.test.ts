import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import {
  ArweaveWrapper,
  getTag,
  LoggerFactory,
  PstContract,
  PstState,
  SmartWeave,
  SmartWeaveNodeFactory,
  SmartWeaveTags
} from '@smartweave';
import path from 'path';
import { addFunds, mineBlock } from '../_helpers';
import { WasmSrc } from '../../../core/modules/impl/wasm/WasmSrc';

describe('Testing the Rust WASM Profit Sharing Token', () => {
  let wallet: JWKInterface;
  let walletAddress: string;

  let initialState: PstState;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let smartweave: SmartWeave;
  let pst: PstContract;

  let contractTxId: string;

  let properForeignContractTxId: string;
  let wrongForeignContractTxId: string;

  let arweaveWrapper;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1201, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1201,
      protocol: 'http'
    });

    arweaveWrapper = new ArweaveWrapper(arweave);

    LoggerFactory.INST.logLevel('error');

    smartweave = SmartWeaveNodeFactory.memCached(arweave);

    wallet = await arweave.wallets.generate();
    await addFunds(arweave, wallet);
    walletAddress = await arweave.wallets.jwkToAddress(wallet);

    const contractSrc = fs.readFileSync(path.join(__dirname, '../data/wasm/rust/rust-pst_bg.wasm'));
    const stateFromFile: PstState = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/token-pst.json'), 'utf8'));

    initialState = {
      ...stateFromFile,
      ...{
        owner: walletAddress,
        balances: {
          ...stateFromFile.balances,
          [walletAddress]: 555669
        }
      }
    };

    // deploying contract using the new SDK.
    contractTxId = await smartweave.createContract.deploy(
      {
        wallet,
        initState: JSON.stringify(initialState),
        src: contractSrc
      },
      path.join(__dirname, '../data/wasm/rust/src'),
      path.join(__dirname, '../data/wasm/rust/rust-pst.js')
    );

    properForeignContractTxId = await smartweave.createContract.deploy(
      {
        wallet,
        initState: JSON.stringify({
          ...initialState,
          ...{
            ticker: 'FOREIGN_PST',
            name: 'foreign contract'
          }
        }),
        src: contractSrc
      },
      path.join(__dirname, '../data/wasm/rust/src'),
      path.join(__dirname, '../data/wasm/rust/rust-pst.js')
    );

    wrongForeignContractTxId = await smartweave.createContract.deploy(
      {
        wallet,
        initState: JSON.stringify({
          ...initialState,
          ...{
            ticker: 'FOREIGN_PST_2',
            name: 'foreign contract 2'
          }
        }),
        src: contractSrc
      },
      path.join(__dirname, '../data/wasm/rust/src'),
      path.join(__dirname, '../data/wasm/rust/rust-pst.js')
    );

    // connecting to the PST contract
    pst = smartweave.pst(contractTxId);

    // connecting wallet to the PST contract
    pst.connect(wallet);

    await mineBlock(arweave);
  }, 50000);

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should properly deploy contract', async () => {
    const contractTx = await arweave.transactions.get(contractTxId);
    expect(contractTx).not.toBeNull();
    expect(getTag(contractTx, SmartWeaveTags.CONTRACT_TYPE)).toEqual('wasm');
    expect(getTag(contractTx, SmartWeaveTags.WASM_LANG)).toEqual('rust');

    const contractSrcTxId = getTag(contractTx, SmartWeaveTags.CONTRACT_SRC_TX_ID);
    const contractSrcTx = await arweave.transactions.get(contractSrcTxId);
    expect(getTag(contractSrcTx, SmartWeaveTags.CONTENT_TYPE)).toEqual('application/wasm');
    expect(getTag(contractSrcTx, SmartWeaveTags.WASM_LANG)).toEqual('rust');
    expect(getTag(contractSrcTx, SmartWeaveTags.WASM_META)).toEqual(JSON.stringify({ dtor: 65 }));

    const srcTxData = await arweaveWrapper.txData(contractSrcTxId);
    const wasmSrc = new WasmSrc(srcTxData);
    expect(wasmSrc.wasmBinary()).not.toBeNull();
    expect(wasmSrc.additionalCode()).toEqual(
      fs.readFileSync(path.join(__dirname, '../data/wasm/rust/rust-pst.js'), 'utf-8')
    );
    expect((await wasmSrc.sourceCode()).size).toEqual(11);
  });

  it('should read pst state and balance data', async () => {
    expect(await pst.currentState()).toEqual(initialState);

    expect(await pst.currentBalance('uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M')).toEqual({ Balance: 10000000 });
    expect(await pst.currentBalance('33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA')).toEqual({ Balance: 23111222 });
    expect(await pst.currentBalance(walletAddress)).toEqual({ Balance: 555669 });
  });

  it('should properly transfer tokens', async () => {
    await pst.transfer({
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 555
    });

    await mineBlock(arweave);

    expect((await pst.currentState()).balances[walletAddress]).toEqual(555669 - 555);
    expect((await pst.currentState()).balances['uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M']).toEqual(10000555);
  });

  it('should properly view contract state', async () => {
    const result = await pst.currentBalance('uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M');
    expect(result).toEqual({ Balance: 10000000 + 555 });
  });

  // note: the dummy logic on the test contract should add 1000 tokens
  // to each address, if the foreign contract state 'ticker' field = 'FOREIGN_PST'
  it('should properly read foreign contract state', async () => {
    await pst.writeInteraction({
      function: 'foreignCall',
      contract_tx_id: wrongForeignContractTxId
    });
    await mineBlock(arweave);
    expect((await pst.currentState()).balances[walletAddress]).toEqual(555669 - 555);
    expect((await pst.currentState()).balances['uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M']).toEqual(10000000 + 555);

    await pst.writeInteraction({
      function: 'foreignCall',
      contract_tx_id: properForeignContractTxId
    });
    await mineBlock(arweave);
    expect((await pst.currentState()).balances[walletAddress]).toEqual(555669 - 555 + 1000);
    expect((await pst.currentState()).balances['uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M']).toEqual(
      10000000 + 555 + 1000
    );
  });

  xit('should return stable gas results', async () => {
    const results = [];

    for (let i = 0; i < 10; i++) {
      const result = await pst.dryWrite({
        function: 'transfer',
        target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
        qty: 555
      });
      results.push(result);
    }

    results.forEach((result) => {
      expect(result.gasUsed).toEqual(9388933);
    });
  }, 10000);

  it('should properly handle runtime errors', async () => {
    const result = await pst.dryWrite({
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 555
    });

    expect(result.type).toEqual('exception');
    expect(result.errorMessage).toEqual('[RE:RE] Error while parsing input');
  });

  it('should properly handle contract errors', async () => {
    const result = await pst.dryWrite({
      function: 'transfer',
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 0
    });

    expect(result.type).toEqual('error');
    expect(result.errorMessage).toEqual('[CE:TransferAmountMustBeHigherThanZero]');
  });

  xit('should honor gas limits', async () => {
    pst.setEvaluationOptions({
      gasLimit: 5000000
    });

    const result = await pst.dryWrite({
      function: 'transfer',
      target: 'uhE-QeYS8i4pmUtnxQyHD7dzXFNaJ9oMK-IM-QPNY6M',
      qty: 555
    });

    expect(result.type).toEqual('exception');
    expect(result.errorMessage.startsWith('[RE:OOG] Out of gas!')).toBeTruthy();
  });
});
