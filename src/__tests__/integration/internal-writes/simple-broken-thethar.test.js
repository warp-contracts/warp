import fs from 'fs';
import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import path from 'path';
import { mineBlock } from '../_helpers';
import { Contract } from '../../../contract/Contract';
import { Warp } from '../../../core/Warp';
import { WarpFactory } from '../../../core/WarpFactory';
import { LoggerFactory } from '../../../logging/LoggerFactory';

const PORT = 1970;

var tarTxId, contractTxId;
var arlocal, arweave, warp, walletJwk;
var tarContract, thetarContract;


describe('flow with broken behaviour', () => {

beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(PORT, false);
    await arlocal.start();
    LoggerFactory.INST.logLevel('error');

    warp = WarpFactory.forLocal(PORT);
    ({ jwk: walletJwk } = await warp.testing.generateWallet());
    arweave = warp.arweave;
  });

  afterAll(async () => {
    await arlocal.stop();
  });

const deployJS = async () => {
  console.log('running...');

  
  const walletAddress = await arweave.wallets.jwkToAddress(walletJwk);
  
  // deploy TAR pst
  const erc20Src = fs.readFileSync(path.join(__dirname, '../data/staking/erc-20.js'), 'utf8');

  const tarInit = {
    symbol: 'TAR',
    name: 'ThetAR exchange token',
    decimals: 2,
    totalSupply: 20000,
    balances: {
      [walletAddress]: 10000,
    },
    allowances: {},
    settings: null,
    owner: walletAddress,
    canEvolve: true,
    evolve: '',
  };

  const tarTxId = (await warp.createContract.deploy({
    wallet: walletJwk,
    initState: JSON.stringify(tarInit),
    src: erc20Src,
  })).contractTxId;
  tarContract = warp.contract(tarTxId);
  tarContract.setEvaluationOptions({
    internalWrites: true,
    allowUnsafeClient: true,
    allowBigInt: true,
  }).connect(walletJwk);

  // deploy thetAR contract
  const contractSrc = fs.readFileSync(path.join(__dirname, '../data/thethar/simple-thethar-contract.js'), 'utf8');
  const contractInit = {
    token: tarTxId,
    orders: []
  };

  contractTxId = (await warp.createContract.deploy({
    wallet: walletJwk,
    initState: JSON.stringify(contractInit),
    src: contractSrc,
  })).contractTxId;
  thetarContract = warp.contract(contractTxId);
  thetarContract.setEvaluationOptions({
    internalWrites: true,
    allowUnsafeClient: true,
    allowBigInt: true,
  }).connect(walletJwk);  

  console.log("THETHAR: " + contractTxId);
  console.log("TAR: " + tarTxId);
};

const create = async (quantity) => {
  console.log('create order...');

  await tarContract.writeInteraction({
    function: 'approve',
    spender: contractTxId,
    amount: quantity
  });

  await mineBlock(warp);

  const txId = (await thetarContract.writeInteraction({
    function: 'create'
  })).originalTxId;

  await mineBlock(warp);

  console.log('AFTER: ', JSON.stringify(await thetarContract.readState()));
}

const cancel = async (orderId) => {
  console.log('cancel order...');

  const txId = await thetarContract.writeInteraction({
    function: 'cancel',
    params: {
      orderId: orderId
    }
  });
  await mineBlock(warp);

  console.log('AFTER: ', JSON.stringify(await thetarContract.readState()));
}



const readFull = async () => {
  const warp = WarpFactory.forLocal(PORT);
  const arweave = warp.arweave;  

  let contract = warp.contract(contractTxId);
  contract.setEvaluationOptions({
    internalWrites: true,
      allowUnsafeClient: true,
      allowBigInt: true,
  }).connect(walletJwk);

  console.log('Contract: ', JSON.stringify(await contract.readState(), null, "  "));

}

    it('correctly evaluate deffered state', async () => {   
 
        await deployJS();
        await create(1);
        await cancel(0);
        //await tryCancelOrder(0);
        //await cancelOrder(0);
        await readFull();
    });

});