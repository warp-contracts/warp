import fs from 'fs';
import ArLocal from 'arlocal';
import path from 'path';
import {mineBlock} from '../_helpers';
import {WarpFactory} from '../../../core/WarpFactory';
import {LoggerFactory} from '../../../logging/LoggerFactory';

const PORT = 1970;

var tarTxId, thethArTxId;
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
    ({jwk: walletJwk} = await warp.generateWallet());
    arweave = warp.arweave;
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  const deploy = async () => {
    console.log('running...');


    //, undefined, {inMemory: false, dbLocation: "./cache/warp"});

    const walletAddress = await arweave.wallets.jwkToAddress(walletJwk);

    // deploy TAR pst
    //const tarSrc = fs.readFileSync(path.join(__dirname, '../data/staking/erc-20.js'), 'utf8');

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

    const wrcSrc = fs.readFileSync(path.join(__dirname, '../data/wrc-20/pkg/erc20-contract_bg.wasm'));
    const tarTxId = (await warp.createContract.deploy({
      wallet: walletJwk,
      initState: JSON.stringify(tarInit),
      src: wrcSrc,
      wasmSrcCodeDir: path.join(__dirname, '../data/wrc-20/src'),
      wasmGlueCode: path.join(__dirname, '../data/wrc-20/pkg/erc20-contract.js'),
    })).contractTxId;

    tarContract = warp.contract(tarTxId);
    tarContract.setEvaluationOptions({
      internalWrites: true,
      allowUnsafeClient: true,
      allowBigInt: true,
    }).connect(walletJwk);

    // deploy thetAR contract
    const contractSrc = fs.readFileSync(path.join(__dirname, '../data/thethar/thethar-contract-wrc.js'), 'utf8');
    const contractInit = {
      feeRatio: 0.03,
      maxPairId: -1,
      pairInfos: [],
      userOrders: {},
      orderInfos: {},
      logs: [], // only for debug
      owner: walletAddress,
      tokenSrcTemplateHashs: [0x0],
      thetarTokenAddress: tarTxId,
    };

    thethArTxId = (await warp.createContract.deploy({
      wallet: walletJwk,
      initState: JSON.stringify(contractInit),
      src: contractSrc,
    })).contractTxId;
    thetarContract = warp.contract(thethArTxId);
    thetarContract.setEvaluationOptions({
      internalWrites: true,
      allowUnsafeClient: true,
      allowBigInt: true,
    }).connect(walletJwk);

    // deploy test pst
    let initialState = {
      symbol: 'TEST',
      name: 'TEST token',
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

    const testTokenTxId = (await warp.createContract.deploy({
      wallet: walletJwk,
      initState: JSON.stringify(initialState),
      src: wrcSrc,
      wasmSrcCodeDir: path.join(__dirname, '../src/wrc-20_fixed_supply'),
      wasmGlueCode: path.join(__dirname, '../data/wrc-20/pkg/erc20-contract.js'),
    })).contractTxId;


    await thetarContract.writeInteraction(
      {
        function: 'addPair',
        params: {
          tokenAddress: testTokenTxId,
          logo: 'TEST_00000lQgApM_a3Z6bGFHYE7SXnBI6C5_2_24MQ',
          description: 'test token'
        }
      }
    );

    console.log("THETHAR: " + thethArTxId);
    console.log("TAR: " + tarTxId);
  };

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

    // const wrcSrc = fs.readFileSync(path.join(__dirname, '../data/wrc-20/pkg/erc20-contract_bg.wasm'));
    // const tarTxId = (await warp.createContract.deploy({
    //   wallet: walletJwk,
    //   initState: JSON.stringify(tarInit),
    //   src: wrcSrc,
    //   wasmSrcCodeDir: path.join(__dirname, '../data/wrc-20/src'),
    //   wasmGlueCode: path.join(__dirname, '../data/wrc-20/pkg/erc20-contract.js'),
    // })).contractTxId;

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
    const contractSrc = fs.readFileSync(path.join(__dirname, '../data/thethar/thethar-contract.js'), 'utf8');
    const contractInit = {
      feeRatio: 0.03,
      maxPairId: -1,
      pairInfos: [],
      userOrders: {},
      orderInfos: {},
      logs: [], // only for debug
      owner: walletAddress,
      tokenSrcTemplateHashs: [0x0],
      thetarTokenAddress: tarTxId,
    };

    thethArTxId = (await warp.createContract.deploy({
      wallet: walletJwk,
      initState: JSON.stringify(contractInit),
      src: contractSrc,
    })).contractTxId;
    thetarContract = warp.contract(thethArTxId);
    thetarContract.setEvaluationOptions({
      internalWrites: true,
      allowUnsafeClient: true,
      allowBigInt: true,
    }).connect(walletJwk);

    // deploy test pst
    let initialState = {
      symbol: 'TEST',
      name: 'TEST token',
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

    const testTokenTxId = (await warp.createContract.deploy({
      wallet: walletJwk,
      initState: JSON.stringify(tarInit),
      src: erc20Src,
    })).contractTxId;

    await thetarContract.writeInteraction(
      {
        function: 'addPair',
        params: {
          tokenAddress: testTokenTxId,
          logo: 'TEST_00000lQgApM_a3Z6bGFHYE7SXnBI6C5_2_24MQ',
          description: 'test token'
        }
      }
    );

    console.log("THETHAR: " + thethArTxId);
    console.log("TAR: " + tarTxId);
  };

  const createOrder = async (direction, quantity, price) => {
    console.log('create order...');

    await tarContract.writeInteraction({
      function: 'approve',
      spender: thethArTxId,
      amount: quantity
    });

    await mineBlock(warp);

    console.log("Direction: " + direction);
    console.log("Price: " + price);
    const txId = (await thetarContract.writeInteraction({
      function: 'createOrder',
      params: {
        pairId: 0,
        direction: direction,
        price: price
      }
    })).originalTxId;
    await mineBlock(warp);

    console.log('AFTER: ', JSON.stringify(await thetarContract.readState(), null, 2));
  }

  const cancelOrder = async (orderIndex) => {
    console.log('cancel order...');

    const orderId = (await thetarContract.readState()).cachedValue.state['orderInfos']['0']['orders'][orderIndex]['orderId'];

    const txId = await thetarContract.writeInteraction({
      function: 'cancelOrder',
      params: {
        pairId: 0,
        orderId: orderId
      }
    });
    await mineBlock(warp);

    console.log('AFTER: ', JSON.stringify(await thetarContract.readState(), null, 2));
  }

  const tryCancelOrder = async (orderIndex) => {
    console.log('cancel order...');

    const freshWarp = WarpFactory.forLocal(PORT);

    const freashThetarContract = freshWarp.contract(thethArTxId);
    freashThetarContract.setEvaluationOptions({
      internalWrites: true,
      allowUnsafeClient: true,
      allowBigInt: true,
    }).connect(walletJwk);

    // let state = (await freashThetarContract.readState());
    // console.log("CANCEL****");
    // console.log(JSON.stringify(state, null, "  "));
    // let orderId = state.cachedValue.state['orderInfos'];
    // console.log(orderId['0']);

    const orderId = (await freashThetarContract.readState()).cachedValue.state['orderInfos']['0']['orders'][orderIndex]['orderId'];

    const txId = await freashThetarContract.writeInteraction({
      function: 'cancelOrder',
      params: {
        pairId: 0,
        orderId: orderId
      }
    });
    await mineBlock(warp);

    console.log('AFTER: ', JSON.stringify(await freashThetarContract.readState(), null, 2));
  }

  const readFull = async () => {
    const warp = WarpFactory.forLocal(PORT);
    //, undefined, {inMemory: false, dbLocation: "./cache/warp"});
    const arweave = warp.arweave;

    let contract = warp.contract(thethArTxId);
    contract.setEvaluationOptions({
      internalWrites: true,
      allowUnsafeClient: true,
      allowBigInt: true,
    }).connect(walletJwk);

    // let thetarTokenContract = warp.contract(tarTxId);
    // thetarTokenContract.setEvaluationOptions({
    //     internalWrites: true,
    //       allowUnsafeClient: true,
    //       allowBigInt: true,
    //   }).connect(walletJwk);

    const result = await contract.readState();

    console.log('Contract: ', JSON.stringify(result, null, "  "));

    return result;


    // console.log('Token: ');
    // console.log(JSON.stringify(await thetarTokenContract.readState(),null, "  "));

  }

  it('correctly evaluate deffered state', async () => {
    await deployJS();
    //await deploy();
    await createOrder('buy', 1, 1);
    //await createOrder('buy', 2, 2);
    //await cancelOrder(0);
    await tryCancelOrder(0);
    //await cancelOrder(0);


    /*let contract = warp.contract(thethArTxId);
    const result1 = await contract.setEvaluationOptions({
      internalWrites: true,
      allowUnsafeClient: true,
      allowBigInt: true,
    }).readState();


    console.log("========= EVALUATION FROM SCRATCH START");
    const result2 = await readFull();
    console.log("========= EVALUATION FROM SCRATCH END");
    expect(result1.cachedValue.state).toEqual(result2.cachedValue.state);*/
  });

});