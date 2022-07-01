import Arweave from 'arweave';
import { CacheableExecutorFactory, Evolve } from '@warp/plugins';
import {
  CacheableStateEvaluator,
  ConfirmationStatus,
  EvalStateResult,
  HandlerExecutorFactory,
  WARP_GW_URL,
  SourceType,
  Warp,
  WarpBuilder
} from '@warp/core';
import { LevelDbCache, MemCache } from '@warp/cache';

export type GatewayOptions = {
  confirmationStatus: ConfirmationStatus;
  source: SourceType;
  address: string;
};

export type CacheOptions = {
  maxStoredTransactions: number;
  inMemory: boolean;
  dbLocation?: string;
};

export const defaultWarpGwOptions: GatewayOptions = {
  confirmationStatus: { notCorrupted: true },
  source: null,
  address: WARP_GW_URL
};

export const defaultCacheOptions: CacheOptions = {
  maxStoredTransactions: 10,
  inMemory: false
};

/**
 * A factory that simplifies the process of creating different versions of {@link Warp}.
 * All versions use the {@link Evolve} plugin.
 */
export class WarpFactory {
  /**
   * creates a Warp instance suitable for testing in a local environment
   * (e.g. usually using ArLocal)
   * @param arweave - an instance of Arweave
   * @param cacheOptions - optional cache options. By default, the in-memory cache is used.
   */
  static forLocal(
    arweave: Arweave,
    cacheOptions = {
      ...defaultCacheOptions,
      inMemory: true
    }
  ) {
    return this.customArweaveGw(arweave, cacheOptions);
  }

  /**
   * creates a Warp instance suitable for testing
   * with Warp testnet (https://testnet.redstone.tools/)
   */
  static forTestnet(cacheOptions = defaultCacheOptions) {
    const arweave = Arweave.init({
      host: 'testnet.redstone.tools',
      port: 443,
      protocol: 'https'
    });

    return this.customArweaveGw(arweave, defaultCacheOptions);
  }

  /**
   * creates a Warp instance suitable for use with mainnet.
   * By default, the Warp gateway (https://github.com/warp-contracts/gateway#warp-gateway)
   * is being used for:
   * 1. deploying contracts
   * 2. writing new transactions through Warp Sequencer
   * 3. loading contract interactions
   *
   * @param cacheOptions - cache options, defaults {@link defaultCacheOptions}
   * @param useArweaveGw - use arweave.net gateway for deploying contracts,
   * writing and loading interactions
   * @param arweave - custom Arweave instance
   */
  static forMainnet(
    cacheOptions = defaultCacheOptions,
    useArweaveGw = false,
    arweave = Arweave.init({
      host: 'arweave.net',
      port: 443,
      protocol: 'https'
    })
  ) {
    if (useArweaveGw) {
      return this.customArweaveGw(arweave, cacheOptions);
    } else {
      return this.customWarpGw(arweave, defaultWarpGwOptions, cacheOptions);
    }
  }

  /**
   * Returns a fully configured {@link Warp} that is using arweave.net compatible gateway
   */
  static customArweaveGw(arweave: Arweave, cacheOptions: CacheOptions = defaultCacheOptions): Warp {
    return this.custom(arweave, cacheOptions).useArweaveGateway().build();
  }

  /**
   * Returns a fully configured {@link Warp} that is using Warp gateway
   */
  static customWarpGw(
    arweave: Arweave,
    gatewayOptions: GatewayOptions = defaultWarpGwOptions,
    cacheOptions: CacheOptions = defaultCacheOptions
  ): Warp {
    return this.custom(arweave, cacheOptions)
      .useWarpGateway(gatewayOptions.confirmationStatus, gatewayOptions.source, gatewayOptions.address)
      .build();
  }

  /**
   * returns an instance of {@link WarpBuilder} that allows to fully customize the Warp instance.
   * @param arweave
   * @param cacheOptions
   */
  static custom(arweave: Arweave, cacheOptions: CacheOptions): WarpBuilder {
    const cache = new LevelDbCache<EvalStateResult<unknown>>(cacheOptions);

    const executorFactory = new CacheableExecutorFactory(arweave, new HandlerExecutorFactory(arweave), new MemCache());
    const stateEvaluator = new CacheableStateEvaluator(arweave, cache, [new Evolve()]);

    return Warp.builder(arweave, cache).setExecutorFactory(executorFactory).setStateEvaluator(stateEvaluator);
  }
}
