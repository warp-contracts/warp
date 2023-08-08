import fs from 'fs';

import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import path from 'path';
import { Warp, Contract, LoggerFactory, WarpFactory, defaultCacheOptions, Tag } from 'warp-contracts';
import { DeployPlugin } from 'warp-contracts-plugin-deploy';
import { SqliteContractCache } from 'warp-contracts-sqlite';
import { VM2Plugin } from 'warp-contracts-plugin-vm2';

describe('Testing Bazar', () => {
  let uSrc: string;
  let ucmSrc: string;
  let assetSrc: string;

  let wallet: JWKInterface;
  let walletAddress: string;
  let wallet2: JWKInterface;
  let walletAddress2: string;

  let ucmInitialState: any;
  let assetInitialState: any;
  let uInitialState: any;

  let arweave: Arweave;
  let arlocal: ArLocal;
  let warp: Warp;
  let warpSqlite: Warp;
  let ucmContractTxId: string;
  let assetContractTxId: string;
  let uContractTxId: string;
  let ucmContract: Contract<any>;
  let assetContract: Contract<any>;
  let uContract: Contract<any>;
  let ucmContractSqlite: Contract<any>;
  let assetContractSqlite: Contract<any>;
  let uContractSqlite: Contract<any>;
  let allowAssetTxId: string;
  let ucmCreateOrderSellResultTxId: string;
  let uAllowTxId: string;

  beforeAll(async () => {
    // note: each tests suit (i.e. file with tests that Jest is running concurrently
    // with another files has to have ArLocal set to a different port!)
    arlocal = new ArLocal(1400, false);
    await arlocal.start();
    LoggerFactory.INST.logLevel('error');

    warp = WarpFactory.forLocal(1400).use(new DeployPlugin());
    warpSqlite = WarpFactory.forLocal(1400)
      .useStateCache(
        new SqliteContractCache(
          {
            ...defaultCacheOptions,
            dbLocation: `./cache/bazar/sqlite/state`
          },
          {
            maxEntriesPerContract: 1000
          }
        )
      )
      .use(new VM2Plugin());
    ({ arweave } = warp);
    ({ jwk: wallet, address: walletAddress } = await warp.generateWallet());
    ({ jwk: wallet2, address: walletAddress2 } = await warp.generateWallet());

    uSrc = fs.readFileSync(path.join(__dirname, '../data/bazar-u.js'), 'utf8');
    ucmSrc = fs.readFileSync(path.join(__dirname, '../data/bazar-ucm.js'), 'utf8');
    assetSrc = fs.readFileSync(path.join(__dirname, '../data/bazar-asset.js'), 'utf8');

    assetInitialState = {
      name: 'Warp Test',
      ticker: 'ATOMIC',
      balances: {
        [walletAddress]: 1000
      },
      claimable: [],
      description: 'Warp Heavy Testing.'
    };

    uInitialState = {
      name: 'U',
      owner: 'jnioZFibZSCcV8o-HkBXYPYEYNib4tqfexP0kCBXX_M',
      ticker: 'U',
      balances: {
        [walletAddress]: 3381632,
        [walletAddress2]: 4000666
      },
      settings: [
        ['isTradeable', true],
        ['communityLogo', 'J3WXX4OGa6wP5E9oLhNyqlN4deYI7ARjrd5se740ftE']
      ],
      claimable: [],
      divisibility: 1000000
    };

    // deploying asset contract using the new SDK.
    ({ contractTxId: assetContractTxId } = await warp.deploy({
      wallet,
      initState: JSON.stringify(assetInitialState),
      src: assetSrc
    }));

    // deploying u contract using the new SDK.
    ({ contractTxId: uContractTxId } = await warp.deploy({
      wallet,
      initState: JSON.stringify(uInitialState),
      src: uSrc
    }));

    ucmInitialState = {
      U: uContractTxId,
      name: 'Universal Content Marketplace - Warp Testing',
      pairs: [],
      ticker: 'PIXL - Warp Testing',
      creator: 'jnioZFibZSCcV8o-HkBXYPYEYNib4tqfexP0kCBXX_M',
      streaks: {},
      balances: {},
      canEvolve: true,
      claimable: [],
      lastReward: 0,
      contributors: {
        tiers: {
          one: {
            members: {
              'A_nS8Da8uIK6RlC2UkZik2xQ83Lt1jMGin-SCQvoMI4': {
                amount: 10,
                lastMint: 0
              },
              HnKoL7ftH0BU3eUveKayuLpKu0XPnRehgBPu1GitZsQ: {
                amount: 10,
                lastMint: 0
              },
              uf_FqRvLqjnFMc8ZzGkF4qWKuNmUIQcYP0tPlCGORQk: {
                amount: 10,
                lastMint: 0
              },
              'vh-NTHVvlKZqRxc8LyyTNok65yQ55a_PJ1zWLb9G2JI': {
                amount: 10,
                lastMint: 0
              }
            },
            percent: 50
          },
          two: {
            members: {
              '9x24zjvs9DA5zAz2DmqBWAg6XcxrrE-8w3EkpwRm4e4': {
                amount: 10,
                lastMint: 0
              },
              'OVr8G0X_CaJWfvVdD-ya0My7q6Mzda5Tfa_hqmK3lGA': {
                amount: 10,
                lastMint: 0
              },
              'P4oNuLO_5VQb9RIsPGzbPb0HZz-RwfrakxIaXn24KJ0': {
                amount: 10,
                lastMint: 0
              }
            },
            percent: 17
          },
          four: {
            members: {
              aVkNOVJow0eBcQDzW0Os0NNsAeFtoWE5zAlDpvQ5FDo: {
                amount: 10,
                lastMint: 0
              }
            },
            percent: 30
          },
          three: {
            members: {
              '89tR0-C1m3_sCWCoVCChg4gFYKdiH5_ZDyZpdJ2DDRw': {
                amount: 10,
                lastMint: 0
              },
              'DMyJZy6_C9a-HCfX0A1uogh92VBV1CjUwifXr7NaGsY': {
                amount: 10,
                lastMint: 0
              },
              'SMft-XozLyxl0ztM-gPSYKvlZVCBiiftNIb4kGFI7wg': {
                amount: 10,
                lastMint: 0
              },
              'vLRHFqCw1uHu75xqB4fCDW-QxpkpJxBtFD9g4QYUbfw': {
                amount: 10,
                lastMint: 0
              }
            },
            percent: 3
          }
        },
        percent: 10
      },
      divisibility: 6,
      originHeight: 1232615,
      transferable: true,
      recentRewards: {}
    };

    // deploying UCM contract using the new SDK.
    ({ contractTxId: ucmContractTxId } = await warp.deploy({
      wallet,
      initState: JSON.stringify(ucmInitialState),
      src: ucmSrc
    }));

    // connecting to the UCM contract
    ucmContract = warp.contract(ucmContractTxId).connect(wallet).setEvaluationOptions({
      internalWrites: true,
      unsafeClient: 'skip',
      allowBigInt: true
    });

    // connecting to the U contract
    uContract = warp.contract(uContractTxId).connect(wallet).setEvaluationOptions({
      internalWrites: true,
      unsafeClient: 'skip',
      allowBigInt: true
    });

    // connecting to the asset contract
    assetContract = warp.contract(assetContractTxId).connect(wallet).setEvaluationOptions({
      internalWrites: true,
      unsafeClient: 'skip',
      allowBigInt: true
    });

    // connecting to the UCM contract
    ucmContractSqlite = warpSqlite.contract(ucmContractTxId).connect(wallet).setEvaluationOptions({
      internalWrites: true,
      unsafeClient: 'skip',
      allowBigInt: true
    });

    // connecting to the U contract
    uContractSqlite = warpSqlite.contract(uContractTxId).connect(wallet).setEvaluationOptions({
      internalWrites: true,
      unsafeClient: 'skip',
      allowBigInt: true
    });

    // connecting to the asset contract
    assetContractSqlite = warpSqlite.contract(assetContractTxId).connect(wallet).setEvaluationOptions({
      internalWrites: true,
      unsafeClient: 'skip',
      allowBigInt: true
    });
  });

  afterAll(async () => {
    await arlocal.stop();
  });

  it('should add pair in ucm', async () => {
    const result = await ucmContract.writeInteraction({
      function: 'addPair',
      pair: [assetContractTxId, uContractTxId]
    });

    const { cachedValue } = await ucmContractSqlite.readState();

    expect(cachedValue.state.pairs[0].pair).toEqual([assetContractTxId, uContractTxId]);
    expect(cachedValue.validity[result!!.originalTxId]).toBe(true);
  });

  it('should set allowance on asset contract', async () => {
    const result = await assetContract.writeInteraction(
      {
        function: 'allow',
        target: ucmContractTxId,
        qty: 100
      },
      { tags: [new Tag('Indexed-By', 'ucm')] }
    );

    allowAssetTxId = result!!.originalTxId;

    const { cachedValue } = await assetContractSqlite.readState();
    expect(JSON.stringify(cachedValue.state['claimable'][0])).toBe(
      JSON.stringify({
        from: walletAddress,
        to: ucmContractTxId,
        qty: 100,
        txID: result?.originalTxId
      })
    );
    expect(cachedValue.validity[result!!.originalTxId]).toBe(true);
  });

  it('should set asset for sale', async () => {
    const result = await ucmContract.writeInteraction({
      function: 'createOrder',
      pair: [assetContractTxId, uContractTxId],
      transaction: allowAssetTxId,
      qty: 100,
      price: 20000
    });

    ucmCreateOrderSellResultTxId = result!!.originalTxId;

    const { cachedValue: cachedValueUcm } = await ucmContractSqlite.readState();
    // const { cachedValue: cachedValueAsset } = await assetContractSqlite.readState();

    expect(JSON.stringify(cachedValueUcm.state.pairs[0].orders[0])).toBe(
      JSON.stringify({
        id: ucmCreateOrderSellResultTxId,
        transfer: allowAssetTxId,
        creator: walletAddress,
        token: assetContractTxId,
        price: 20000,
        quantity: 100,
        originalQuantity: 100
      })
    );
    const cachedAssetState = (await warpSqlite.stateEvaluator.getCache().getLast(assetContractTxId)) as any;
    expect(cachedAssetState.cachedValue.state.balances[ucmContractTxId]).toBe(100);
    expect(cachedAssetState?.cachedValue.state.balances[walletAddress]).toBe(900);
    expect(cachedAssetState.cachedValue.state['claimable'].length).toBe(0);

    expect(cachedValueUcm.validity[result!!.originalTxId]).toBe(true);
    expect(cachedAssetState.cachedValue.validity[result!!.originalTxId]).toBe(true);
  });

  it('should correctly cancel order', async () => {
    const result = await ucmContract.writeInteraction({
      function: 'cancelOrder',
      orderID: ucmCreateOrderSellResultTxId
    });

    const { cachedValue } = await ucmContractSqlite.readState();

    expect(cachedValue.state.pairs[0].orders.length).toEqual(0);

    // const { cachedValue: cachedValueAsset } = await assetContractSqlite.readState();
    const cachedAssetState = (await warpSqlite.stateEvaluator.getCache().getLast(assetContractTxId)) as any;
    expect(cachedAssetState.cachedValue.state.balances[ucmContractTxId]).toBe(0);
    expect(cachedAssetState.cachedValue.state.balances[walletAddress]).toBe(1000);

    expect(cachedAssetState.cachedValue.validity[result!!.originalTxId]).toBe(true);
    expect(cachedValue.validity[result!!.originalTxId]).toBe(true);
  });

  it('should correctly set asset for sale and set allowance on U', async () => {
    const allowResult = await assetContract.writeInteraction(
      {
        function: 'allow',
        target: ucmContractTxId,
        qty: 100
      },
      { tags: [new Tag('Indexed-By', 'ucm')] }
    );

    const result = await ucmContract.writeInteraction({
      function: 'createOrder',
      pair: [assetContractTxId, uContractTxId],
      transaction: allowResult?.originalTxId,
      qty: 100,
      price: 20000
    });

    const wallet2uContract = warp.contract(uContractTxId).connect(wallet2).setEvaluationOptions({
      internalWrites: true,
      unsafeClient: 'skip',
      allowBigInt: true
    });
    const uAllowResult = await wallet2uContract.writeInteraction({
      function: 'allow',
      qty: 20000,
      target: ucmContractTxId
    });

    uAllowTxId = uAllowResult!!.originalTxId;

    const { cachedValue } = await uContractSqlite.readState();
    expect(JSON.stringify(cachedValue.state['claimable'][0])).toBe(
      JSON.stringify({
        from: walletAddress2,
        to: ucmContractTxId,
        qty: 20000,
        txID: uAllowResult?.originalTxId
      })
    );
    expect(cachedValue.validity[uAllowResult!!.originalTxId]).toBe(true);
  });

  it('should sell asset', async () => {
    const wallet2UcmContract = warp.contract(ucmContractTxId).connect(wallet2).setEvaluationOptions({
      internalWrites: true,
      unsafeClient: 'skip',
      allowBigInt: true
    });
    const wallet2UcmContractSqlite = warpSqlite.contract(ucmContractTxId).connect(wallet2).setEvaluationOptions({
      internalWrites: true,
      unsafeClient: 'skip',
      allowBigInt: true
    });
    await wallet2UcmContract.writeInteraction({
      function: 'createOrder',
      pair: [uContractTxId, assetContractTxId],
      transaction: uAllowTxId,
      qty: 20000
    });

    // const { cachedValue: uCachedValue } = await uContractSqlite.readState();
    // const { cachedValue: assetCachedValue } = await assetContractSqlite.readState();
    const { cachedValue: ucmCachedValue } = await wallet2UcmContractSqlite.readState();
    const cachedAssetState = (await warpSqlite.stateEvaluator.getCache().getLast(assetContractTxId)) as any;
    const cachedUState = (await warpSqlite.stateEvaluator.getCache().getLast(uContractTxId)) as any;

    expect(cachedUState.cachedValue.state['claimable'].length).toBe(0);
    expect(cachedAssetState.cachedValue.state.balances[ucmContractTxId]).toBe(99);
    expect(cachedAssetState.cachedValue.state.balances[walletAddress]).toBe(900);
    expect(cachedAssetState.cachedValue.state.balances[walletAddress2]).toBe(1);
    expect(cachedUState.cachedValue.state.balances[walletAddress2]).toBe(3980666);
    expect(ucmCachedValue.state['pairs'][0]['orders'][0]['quantity']).toBe(99);
  });
});
