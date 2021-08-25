/* eslint-disable */
import Arweave from 'arweave';
import * as fs from 'fs';
import {
  CacheableExecutorFactory,
  CacheableStateEvaluator,
  ContractDefinitionLoader,
  ContractInteractionsLoader,
  DebuggableExecutorFactory,
  EvalStateResult,
  EvolveCompatibleState,
  HandlerBasedContract,
  HandlerExecutorFactory,
  LexicographicalInteractionsSorter,
  LoggerFactory,
  MemBlockHeightSwCache,
  MemCache
} from '@smartweave';

// note: this ofc. should be imported from the given SWC source code.
interface ProvidersRegistryState extends EvolveCompatibleState {
  contractAdmins: string[];
}

export function timeout(ms: number): Promise<any> {
  return new Promise((resolve) => setTimeout(() => resolve('timeout'), ms));
}

const logger = LoggerFactory.INST.create(__filename);
LoggerFactory.INST.logLevel('silly', 'example-usage');

async function readContractState() {
  const arweave = Arweave.init({
    host: 'arweave.net', // Hostname or IP address for a Arweave host
    port: 443, // Port
    protocol: 'https', // Network protocol http or https
    timeout: 20000, // Network request timeouts in milliseconds
    logging: false // Enable network request logging
  });

  logger.trace('arweave created');

  const changedSrc = `function handle(state, action) {
   console.log("hello world from the new source:", SmartWeave.transaction.id);
   return {state}
  }`;

  const cacheableExecutorFactory = new CacheableExecutorFactory<any, any>(
    arweave,
    new HandlerExecutorFactory(arweave),
    new MemCache()
  );

  const debuggableExecutorFactory = new DebuggableExecutorFactory(cacheableExecutorFactory, {
    'OrO8n453N6bx921wtsEs-0OCImBLCItNU5oSbFKlFuU': changedSrc
  });

  const swcClient = new HandlerBasedContract(
    arweave,
    new ContractDefinitionLoader<ProvidersRegistryState>(arweave, new MemCache()),
    new ContractInteractionsLoader(arweave),
    debuggableExecutorFactory,
    new CacheableStateEvaluator(arweave, new MemBlockHeightSwCache<EvalStateResult<ProvidersRegistryState>>()),
    new LexicographicalInteractionsSorter(arweave)
  );

  logger.trace('swcClient created');

  const jwk = readJSON('../../redstone-node/.secrets/redstone-dev-jwk.json');
  const jwkAddress = await arweave.wallets.jwkToAddress(jwk);

  logger.trace('jwkAddress:', jwkAddress);

  const { state, validity } = await swcClient.readState('OrO8n453N6bx921wtsEs-0OCImBLCItNU5oSbFKlFuU');

  function readJSON(path) {
    const content = fs.readFileSync(path, 'utf-8');
    try {
      return JSON.parse(content);
    } catch (e) {
      throw new Error(`File "${path}" does not contain a valid JSON`);
    }
  }
}

readContractState().catch((e) => {
  logger.error(e);
});
