import Arweave from 'arweave';
import { CacheableExecutorFactory, Evolve } from '@smartweave/plugins';
import {
  CacheableStateEvaluator,
  ConfirmationStatus,
  EvalStateResult,
  HandlerExecutorFactory,
  R_GW_URL,
  SmartWeave,
  SmartWeaveBuilder,
  SourceType
} from '@smartweave/core';
import { LevelDbCache, MemCache } from '@smartweave/cache';

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
  address: R_GW_URL
};

export const defaultCacheOptions: CacheOptions = {
  maxStoredTransactions: 10,
  inMemory: false
};
/**
 * A factory that simplifies the process of creating different versions of {@link SmartWeave}.
 * All versions use the {@link Evolve} plugin.
 */
export class SmartWeaveFactory {
  /**
   * Returns a fully configured {@link SmartWeave} that is using arweave.net compatible gateway
   * (with a GQL endpoint) for loading the interactions and in memory cache.
   * Suitable for testing.
   */
  static forTesting(arweave: Arweave): SmartWeave {
    return this.arweaveGw(arweave, {
      maxStoredTransactions: 20,
      inMemory: true
    });
  }

  /**
   * Returns a fully configured {@link SmartWeave} that is using arweave.net compatible gateway
   * (with a GQL endpoint) for loading the interactions.
   */
  static arweaveGw(
    arweave: Arweave,
    cacheOptions: CacheOptions = {
      maxStoredTransactions: 20,
      inMemory: false
    }
  ): SmartWeave {
    return this.levelDbCached(arweave, cacheOptions).useArweaveGateway().build();
  }

  /**
   * Returns a fully configured {@link SmartWeave} that is using Warp gateway for loading the interactions.
   */
  static warpGw(
    arweave: Arweave,
    gatewayOptions: GatewayOptions = defaultWarpGwOptions,
    cacheOptions: CacheOptions = {
      maxStoredTransactions: 20,
      inMemory: false
    }
  ): SmartWeave {
    return this.levelDbCached(arweave, cacheOptions)
      .useRedStoneGateway(gatewayOptions.confirmationStatus, gatewayOptions.source, gatewayOptions.address)
      .build();
  }

  static levelDbCached(arweave: Arweave, cacheOptions: CacheOptions): SmartWeaveBuilder {
    const executorFactory = new CacheableExecutorFactory(arweave, new HandlerExecutorFactory(arweave), new MemCache());
    const stateEvaluator = new CacheableStateEvaluator(
      arweave,
      new LevelDbCache<EvalStateResult<unknown>>(cacheOptions),
      [new Evolve()]
    );

    return SmartWeave.builder(arweave).setExecutorFactory(executorFactory).setStateEvaluator(stateEvaluator);
  }
}
