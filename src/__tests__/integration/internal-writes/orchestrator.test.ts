/* eslint-disable */
import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Contract, LoggerFactory, SmartWeave, SmartWeaveNodeFactory } from '@smartweave';
import path from 'path';
import { TsLogFactory } from '../../../logging/node/TsLogFactory';

/**
 * This tests verifies an ability of a contract to execute multiple calls to external contracts in a single transaction.
 * A common example when it could be helpful is allowing a token to spend an amount and call a selected staking contract
 * to consume this allowance. 
 */
describe('Testing internal writes', () => {
  let tokenContractSrc: string;
  let tokenContractInitialState: string;
  let tokenContract: Contract<any>;
  let tokenContractTxId;

  let stakingContractSrc: string;
  let stakingContractInitialState: string;
  let stakingContract: Contract<any>;
  let stakingContractTxId;

  let orchestratorContractSrc: string;
  let orchestratorContract: Contract<any>;
  let orchestratorContractTxId;

  let wallet: JWKInterface;
  let walletAddress: string;

  let other: JWKInterface;
  let otherAddress: string;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let smartweave: SmartWeave;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1960, false);
    await arlocal.start();

    arweave = Arweave.init({
      host: 'localhost',
      port: 1960,
      protocol: 'http'
    });

    LoggerFactory.use(new TsLogFactory());
    LoggerFactory.INST.logLevel('error');
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  async function deployContracts() {
    smartweave = SmartWeaveNodeFactory.memCached(arweave);

    wallet = await arweave.wallets.generate();
    walletAddress = await arweave.wallets.jwkToAddress(wallet);

    other = await arweave.wallets.generate();
    otherAddress = await arweave.wallets.jwkToAddress(other);

    tokenContractSrc = fs.readFileSync(path.join(__dirname, '../data/staking/erc-20.js'), 'utf8');
    tokenContractInitialState = fs.readFileSync(path.join(__dirname, '../data/staking/erc-20.json'), 'utf8');
    stakingContractSrc = fs.readFileSync(path.join(__dirname, '../data/staking/staking-contract.js'), 'utf8');
    stakingContractInitialState = fs.readFileSync(
      path.join(__dirname, '../data/staking/staking-contract.json'),
      'utf8'
    );
    orchestratorContractSrc = fs.readFileSync(path.join(__dirname, '../data/staking/orchestrator.js'), 'utf8');

    tokenContractTxId = await smartweave.createContract.deploy({
      wallet,
      initState: JSON.stringify({
        ...JSON.parse(tokenContractInitialState),
        owner: walletAddress
      }),
      src: tokenContractSrc
    });

    stakingContractTxId = await smartweave.createContract.deploy({
      wallet,
      initState: JSON.stringify({
        ...JSON.parse(stakingContractInitialState),
        tokenTxId: tokenContractTxId
      }),
      src: stakingContractSrc
    });

    orchestratorContractTxId = await smartweave.createContract.deploy({
      wallet,
      initState: JSON.stringify({
        stakingContractTxId: stakingContractTxId,
        owner: walletAddress
      }),
      src: orchestratorContractSrc
    });

    tokenContract = smartweave
      .contract(tokenContractTxId)
      .setEvaluationOptions({ internalWrites: true })
      .connect(wallet);

    stakingContract = smartweave
      .contract(stakingContractTxId)
      .setEvaluationOptions({ internalWrites: true })
      .connect(wallet);

    orchestratorContract = smartweave
      .contract(orchestratorContractTxId)
      .setEvaluationOptions({ internalWrites: true })
      .connect(wallet);  

    await mine();
  }

  describe('with read states in between', () => {
    beforeAll(async () => {
      await deployContracts();
    });

    it('should deploy contracts with initial state', async () => {
      expect((await tokenContract.readState()).state).toEqual({
        allowances: {},
        balances: {},
        owner: walletAddress,
        ticker: 'ERC-20',
        totalSupply: 0
      });
      expect((await stakingContract.readState()).state).toEqual({
        minimumStake: 1000,
        stakes: {},
        tokenTxId: tokenContractTxId,
        unstakePeriod: 10
      });
      expect((await orchestratorContract.readState()).state).toEqual({
        owner: walletAddress,  
        stakingContractTxId: stakingContractTxId
      });
    });

    it('should mint tokens', async () => {
      await tokenContract.writeInteraction({
        function: 'mint',
        account: orchestratorContractTxId,
        amount: 10000
      });
      await mine();

      const tokenState = (await tokenContract.readState()).state;

      expect(tokenState.balances).toEqual({
        [orchestratorContractTxId]: 10000
      });
      expect(tokenState.totalSupply).toEqual(10000);
    });

    it('should not allow operating orchestrator by non owner', async () => {
      const orchestratorContractManagedByOther = smartweave
        .contract(orchestratorContractTxId)
        .setEvaluationOptions({ internalWrites: true })
        .connect(other); 

      await orchestratorContractManagedByOther.writeInteraction({
        function: 'approveAndStake',
        amount: 1000
      });

      await mine();

      expect((await stakingContract.readState()).state.stakes).toEqual({});
    });

    it('should approveAndStake tokens', async () => {
      await orchestratorContract.writeInteraction({
        function: 'approveAndStake',
        amount: 1000
      });
      await mine();

      expect((await stakingContract.readState()).state.stakes).toEqual({
        [orchestratorContractTxId]: {
          amount: 1000,
          unlockWhen: 0
        }
      });

      const tokenState = (await tokenContract.readState()).state;
      expect(tokenState.balances).toEqual({
        [orchestratorContractTxId]: 9000,
        [stakingContractTxId]: 1000
      });
      
    });
  });

  async function mine() {
    await arweave.api.get('mine');
  }
});
