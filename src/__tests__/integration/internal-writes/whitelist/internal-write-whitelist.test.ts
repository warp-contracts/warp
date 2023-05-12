/* eslint-disable */
import fs from 'fs';

import ArLocal from 'arlocal';
import { JWKInterface } from 'arweave/node/lib/wallet';
import path from 'path';
import { mineBlock } from '../../_helpers';
import { Contract, WritesAware } from '../../../../contract/Contract';
import { Warp } from '../../../../core/Warp';
import { WarpFactory } from '../../../../core/WarpFactory';
import { LoggerFactory } from '../../../../logging/LoggerFactory';
import { DeployPlugin } from 'warp-contracts-plugin-deploy';
import Transaction from 'arweave/node/lib/transaction';
import { WARP_TAGS } from '../../../../core/KnownTags';
import { createInteractionTx } from '../../../../legacy/create-interaction-tx';
import { Signature } from '../../../../contract/Signature';

interface ExampleContractState {
  counter: number;
  errorCounter: number;
}

type CalleeState = ExampleContractState & WritesAware;

describe('Testing internal writes with whitelist', () => {
  let callingContractSrc: string;
  let callingContractInitialState: string;
  let calleeContractSrc: string;
  let calleeInitialState: string;

  let wallet: JWKInterface;

  let arlocal: ArLocal;
  let warp: Warp;
  let calleeContract: Contract<CalleeState>;
  let callingContract: Contract<ExampleContractState>;
  let calleeTxId;
  let callingTxId;
  let callingSrcTxId;

  const port = 1289;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(port, false);
    await arlocal.start();
    LoggerFactory.INST.logLevel('error');

    warp = WarpFactory.forLocal(port).use(new DeployPlugin());
    ({ jwk: wallet } = await warp.generateWallet());
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  async function deployContracts() {
    callingContractSrc = fs.readFileSync(path.join(__dirname, '../../data/writing-contract.js'), 'utf8');
    callingContractInitialState = fs.readFileSync(
      path.join(__dirname, '../../data/writing-contract-state.json'),
      'utf8'
    );
    calleeContractSrc = fs.readFileSync(path.join(__dirname, '../../data/example-contract.js'), 'utf8');
    calleeInitialState = fs.readFileSync(path.join(__dirname, '../../data/example-contract-state.json'), 'utf8');

    ({ contractTxId: callingTxId, srcTxId: callingSrcTxId } = await warp.deploy({
      wallet,
      initState: callingContractInitialState,
      src: callingContractSrc
    }));

    callingContract = warp
      .contract<ExampleContractState>(callingTxId)
      .setEvaluationOptions({
        internalWrites: true,
        mineArLocalBlocks: false
      })
      .connect(wallet);
    await mineBlock(warp);
  }

  beforeAll(async () => {
    await deployContracts();

    ({ contractTxId: calleeTxId } = await warp.deploy({
      wallet,
      initState: JSON.stringify({
        allowedSrcTxIds: [],
        ...JSON.parse(calleeInitialState)
      }),
      src: calleeContractSrc
    }));

    calleeContract = warp
      .contract<CalleeState>(calleeTxId)
      .setEvaluationOptions({
        internalWrites: true,
        mineArLocalBlocks: false
      })
      .connect(wallet);

    await mineBlock(warp);
  });

  it('should block internal write on creation in strict mode', async () => {
    await expect(
      callingContract.writeInteraction(
        {
          function: 'writeContract',
          contractId: calleeTxId,
          amount: 10
        },
        { strict: true }
      )
    ).rejects.toThrowError('[WriteNotAllowed]');
  });

  it('should skip evaluation of the inner write tx', async () => {
    await calleeContract.writeInteraction({ function: 'add' });
    await mineBlock(warp);

    const invalidTx2 = await callingContract.writeInteraction({
      function: 'writeContract',
      contractId: calleeTxId,
      amount: 10
    });
    await mineBlock(warp);

    await calleeContract.writeInteraction({ function: 'add' });
    await mineBlock(warp);

    const result = await calleeContract.readState();
    expect(result.cachedValue.validity[invalidTx2.originalTxId]).toBeUndefined();
  });

  it('should allow evaluation after adding to allowed array', async () => {
    await calleeContract.writeInteraction({
      function: 'setAllowedSrc',
      allowedSrc: [callingSrcTxId]
    });
    await mineBlock(warp);

    const writeTx = await callingContract.writeInteraction({
      function: 'writeContract',
      contractId: calleeTxId,
      amount: 10
    });
    await mineBlock(warp);

    const result = await calleeContract.readState();
    expect(result.cachedValue.validity[writeTx.originalTxId]).toBeTruthy();
    expect(result.cachedValue.state.counter).toEqual(567);
  });

  it('should block writes made outside of the SDK if whitelist empty', async () => {
    // clear the white list
    await calleeContract.writeInteraction({
      function: 'setAllowedSrc',
      allowedSrc: []
    });
    await mineBlock(warp);

    const hackedTx = await createInteractionTx(
      warp.arweave,
      new Signature(warp, wallet).signer,
      callingTxId,
      {
        function: 'writeContract',
        contractId: calleeTxId,
        amount: 10
      },
      [{ name: WARP_TAGS.INTERACT_WRITE, value: calleeTxId }],
      '',
      '0',
      false,
      false
    );
    const response = await warp.arweave.transactions.post(hackedTx);
    expect(response.status).toEqual(200);
    await mineBlock(warp);

    const result = await calleeContract.readState();
    expect(result.cachedValue.validity[hackedTx.id]).toBeFalsy();
    expect(result.cachedValue.errorMessages[hackedTx.id]).toContain('[WriteNotAllowed]');
  });

  it('should allow writes made outside of the SDK if whitelist non-empty', async () => {
    // add the white list
    await calleeContract.writeInteraction({
      function: 'setAllowedSrc',
      allowedSrc: [callingSrcTxId]
    });
    await mineBlock(warp);

    const hackedTx = await createInteractionTx(
      warp.arweave,
      new Signature(warp, wallet).signer,
      callingTxId,
      {
        function: 'writeContract',
        contractId: calleeTxId,
        amount: 10
      },
      [{ name: WARP_TAGS.INTERACT_WRITE, value: calleeTxId }],
      '',
      '0',
      false,
      false
    );
    const response = await warp.arweave.transactions.post(hackedTx);
    expect(response.status).toEqual(200);
    await mineBlock(warp);

    const result = await calleeContract.readState();
    expect(result.cachedValue.validity[hackedTx.id]).toBeTruthy();
    expect(result.cachedValue.state.counter).toEqual(577);
  });
});
