import {
  Benchmark,
  BlockHeightCacheResult,
  canBeCached,
  ContractInteraction,
  CurrentTx,
  EvalStateResult,
  ExecutionContext,
  ExecutionContextModifier,
  GQLEdgeInterface,
  GQLNodeInterface,
  GQLTagInterface,
  HandlerApi,
  InteractionCall,
  HandlerResult,
  LoggerFactory,
  StateEvaluator,
  TagsParser,
  VrfData,
  InvalidInteraction,
  UnexpectedInteractionError
} from '@warp';
import { AppError, exhaustive } from '@warp/utils';
import Arweave from 'arweave';

import { ProofHoHash } from '@idena/vrf-js';
import elliptic from 'elliptic';
import { err, ok, Result } from 'neverthrow';

const EC = new elliptic.ec('secp256k1');

/**
 * This class contains the base functionality of evaluating the contracts state - according
 * to the SmartWeave protocol.
 * Marked as abstract - as without help of any cache - the evaluation in real-life applications
 * would be really slow - so using this class without any caching ({@link CacheableStateEvaluator})
 * mechanism built on top makes no sense.
 */
export abstract class DefaultStateEvaluator implements StateEvaluator {
  private readonly logger = LoggerFactory.INST.create('DefaultStateEvaluator');

  private readonly tagsParser = new TagsParser();

  protected constructor(
    protected readonly arweave: Arweave,
    private readonly executionContextModifiers: ExecutionContextModifier[] = []
  ) {}

  async eval<State>(
    executionContext: ExecutionContext<State, HandlerApi<State>>,
    currentTx: CurrentTx[]
  ): Promise<Result<EvalStateResult<State>, AppError<UnexpectedInteractionError>>> {
    return this.doReadState(
      executionContext.sortedInteractions,
      new EvalStateResult<State>(executionContext.contractDefinition.initState, {}),
      executionContext,
      currentTx
    );
  }

  protected async doReadState<State>(
    missingInteractions: GQLEdgeInterface[],
    baseState: EvalStateResult<State>,
    executionContext: ExecutionContext<State, HandlerApi<State>>,
    currentTx: CurrentTx[]
  ): Promise<Result<EvalStateResult<State>, AppError<UnexpectedInteractionError>>> {
    const { ignoreExceptions, stackTrace, internalWrites } = executionContext.evaluationOptions;
    const { contract, contractDefinition, sortedInteractions } = executionContext;

    let currentState = baseState.state;
    const validity = baseState.validity;

    executionContext?.handler.initState(currentState);

    this.logger.debug(
      `Evaluating state for ${contractDefinition.txId} [${missingInteractions.length} non-cached of ${sortedInteractions.length} all]`
    );

    let errorMessage = null;
    let lastConfirmedTxState: { tx: GQLNodeInterface; state: EvalStateResult<State> } = null;

    const missingInteractionsLength = missingInteractions.length;
    executionContext.handler.initState(currentState);

    for (let i = 0; i < missingInteractionsLength; i++) {
      const missingInteraction = missingInteractions[i];
      const singleInteractionBenchmark = Benchmark.measure();

      const interactionTx: GQLNodeInterface = missingInteraction.node;

      if (interactionTx.vrf) {
        if (!this.verifyVrf(interactionTx.vrf, interactionTx.sortKey, this.arweave)) {
          throw new Error('Vrf verification failed.');
        }
      }

      this.logger.debug(
        `[${contractDefinition.txId}][${missingInteraction.node.id}][${missingInteraction.node.block.height}]: ${
          missingInteractions.indexOf(missingInteraction) + 1
        }/${missingInteractions.length} [of all:${sortedInteractions.length}]`
      );

      const isInteractWrite = this.tagsParser.isInteractWrite(missingInteraction, contractDefinition.txId);

      // other contract makes write ("writing contract") on THIS contract
      if (isInteractWrite && internalWrites) {
        // evaluating txId of the contract that is writing on THIS contract
        const writingContractTxId = this.tagsParser.getContractTag(missingInteraction);
        this.logger.debug('Loading writing contract', writingContractTxId);

        const interactionCall: InteractionCall = contract
          .getCallStack()
          .addInteractionData({ interaction: null, interactionTx, currentTx });

        // creating a Contract instance for the "writing" contract
        const writingContract = executionContext.warp.contract(
          writingContractTxId,
          executionContext.contract,
          interactionTx
        );

        this.logger.debug('Reading state of the calling contract', interactionTx.block.height);

        /**
         Reading the state of the writing contract.
         This in turn will cause the state of THIS contract to be
         updated in cache - see {@link ContractHandlerApi.assignWrite}
         */
        await writingContract.readState(interactionTx.block.height, [
          ...(currentTx || []),
          {
            contractTxId: contractDefinition.txId, //not: writingContractTxId!
            interactionTxId: missingInteraction.node.id
          }
        ]);

        // loading latest state of THIS contract from cache
        const newState = await this.latestAvailableState<State>(contractDefinition.txId, interactionTx.block.height);
        this.logger.debug('New state:', {
          height: interactionTx.block.height,
          newState,
          txId: contractDefinition.txId
        });

        if (newState !== null) {
          currentState = newState.cachedValue.state;
          // we need to update the state in the wasm module
          executionContext?.handler.initState(currentState);
          validity[interactionTx.id] = newState.cachedValue.validity[interactionTx.id];

          const toCache = new EvalStateResult(currentState, validity);

          // TODO: probably a separate hook should be created here
          // to fix https://github.com/redstone-finance/warp/issues/109
          await this.onStateUpdate<State>(interactionTx, executionContext, toCache);
          if (canBeCached(interactionTx)) {
            lastConfirmedTxState = {
              tx: interactionTx,
              state: toCache
            };
          }
        } else {
          validity[interactionTx.id] = false;
        }

        interactionCall.update({
          cacheHit: false,
          intermediaryCacheHit: false,
          outputState: stackTrace.saveState ? currentState : undefined,
          executionTime: singleInteractionBenchmark.elapsed(true) as number,
          valid: validity[interactionTx.id],
          errorMessage: errorMessage,
          gasUsed: 0 // TODO...
        });

        this.logger.debug('New state after internal write', { contractTxId: contractDefinition.txId, newState });
      } else {
        // "direct" interaction with this contract - "standard" processing
        const inputTag = this.tagsParser.getInputTag(missingInteraction, executionContext.contractDefinition.txId);
        if (!inputTag) {
          this.logger.error(`Skipping tx - Input tag not found for ${interactionTx.id}`);
          continue;
        }
        const input = this.parseInput(inputTag);
        if (!input) {
          this.logger.error(`Skipping tx - invalid Input tag - ${interactionTx.id}`);
          continue;
        }

        const interaction: ContractInteraction<unknown> = {
          input,
          caller: interactionTx.owner.address
        };

        const interactionData = {
          interaction,
          interactionTx,
          currentTx
        };

        this.logger.debug('Interaction:', interaction);

        const interactionCall: InteractionCall = contract.getCallStack().addInteractionData(interactionData);

        const result = await executionContext.handler.handle(
          executionContext,
          new EvalStateResult(currentState, validity),
          interactionData
        );

        errorMessage = result.isErr() ? result.error.detail.error.message : '';

        this.logResult<State>(result, interactionTx, executionContext);

        this.logger.debug('Interaction evaluation', singleInteractionBenchmark.elapsed());

        interactionCall.update({
          cacheHit: false,
          intermediaryCacheHit: false,
          outputState: stackTrace.saveState ? currentState : undefined,
          executionTime: singleInteractionBenchmark.elapsed(true) as number,
          valid: validity[interactionTx.id],
          errorMessage: errorMessage,
          gasUsed: result.isOk() ? result.value.gasUsed : undefined
        });

        if (result.isErr()) {
          const error = result.error.detail;
          if (error.type === 'UnexpectedInteractionError' && ignoreExceptions !== true) {
            // NOTE: Typescript doesn't appear to be able to infer the type in a way that it
            // discriminate `AppError<InvalidInteraction | UnexpectedInteractionError>` into
            // `AppError<UnexpectedInteractionError>`. This means that we have 2 options. We can:
            //
            // 1. Return a new error like so: `return err(new AppError(error))` as
            // typescript can statically verify that `error` is an `UnexpectedInteractionError`.
            // This solution however means we loose the stacktrace of the original AppError
            // produced by `executionContext.handler.handle`.
            //
            // 2. Manually cast result.error into the correct type
            // `AppError<UnexpectedInteractionError>`. as we made sure that the error couldn't be
            // anything else than an `UnexpectedInteractionError`. However, doing this should be
            // considered bad practice bc the casting is unsafe as Typescript would also allow us
            // to cast it to `AppError<InvalidInteraction>` for example without showing any error
            // at compile-time.
            //
            // I still choose option 2 as it allows to preserve the stacktrace of the error.
            return err(result.error as AppError<UnexpectedInteractionError>);
          }
        }

        validity[interactionTx.id] = result.isErr();
        if (result.isOk()) {
          currentState = result.value.state;
        }

        const toCache = new EvalStateResult(currentState, validity);
        if (canBeCached(interactionTx)) {
          lastConfirmedTxState = {
            tx: interactionTx,
            state: toCache
          };
        }
        await this.onStateUpdate<State>(interactionTx, executionContext, toCache, i);
      }

      // I'm really NOT a fan of this "modify" feature, but I don't have idea how to better
      // implement the "evolve" feature
      for (const { modify } of this.executionContextModifiers) {
        executionContext = await modify<State>(currentState, executionContext);
      }
    }
    //this.logger.info('State evaluation total:', stateEvaluationBenchmark.elapsed());
    const evalStateResult = new EvalStateResult<State>(currentState, validity);

    // state could have been fully retrieved from cache
    // or there were no interactions below requested block height
    if (lastConfirmedTxState !== null) {
      await this.onStateEvaluated(lastConfirmedTxState.tx, executionContext, lastConfirmedTxState.state);
    }

    return ok(evalStateResult);
  }

  private verifyVrf(vrf: VrfData, sortKey: string, arweave: Arweave): boolean {
    const keys = EC.keyFromPublic(vrf.pubkey, 'hex');

    let hash;
    try {
      // ProofHoHash throws its own 'invalid vrf' exception
      hash = ProofHoHash(
        keys.getPublic(),
        arweave.utils.stringToBuffer(sortKey),
        arweave.utils.b64UrlToBuffer(vrf.proof)
      );
    } catch (e: any) {
      return false;
    }

    return arweave.utils.bufferTob64Url(hash) == vrf.index;
  }

  private logResult<State>(
    result: Result<HandlerResult<State, unknown>, AppError<InvalidInteraction | UnexpectedInteractionError>>,
    currentTx: GQLNodeInterface,
    executionContext: ExecutionContext<State, HandlerApi<State>>
  ) {
    if (result.isErr()) {
      switch (result.error.detail.type) {
        case 'UnexpectedInteractionError':
          this.logger.error(
            `Executing of interaction: [${executionContext.contractDefinition.txId} -> ${currentTx.id}] threw exception:`,
            `${result.error.detail.error.message}`
          );
          break;

        case 'InvalidInteraction':
          this.logger.warn(
            `Executing of interaction: [${executionContext.contractDefinition.txId} -> ${currentTx.id}] returned error:`,
            result.error.detail.error.message
          );
          break;

        default:
          exhaustive(result.error.detail);
      }
    }
  }

  private parseInput(inputTag: GQLTagInterface): unknown | null {
    try {
      return JSON.parse(inputTag.value);
    } catch (e) {
      this.logger.error(e);
      return null;
    }
  }

  abstract latestAvailableState<State>(
    contractTxId: string,
    blockHeight: number
  ): Promise<BlockHeightCacheResult<EvalStateResult<State>> | null>;

  abstract onContractCall<State>(
    transaction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>
  ): Promise<void>;

  abstract onInternalWriteStateUpdate<State>(
    transaction: GQLNodeInterface,
    contractTxId: string,
    state: EvalStateResult<State>
  ): Promise<void>;

  abstract onStateEvaluated<State>(
    transaction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>
  ): Promise<void>;

  abstract onStateUpdate<State>(
    transaction: GQLNodeInterface,
    executionContext: ExecutionContext<State>,
    state: EvalStateResult<State>,
    nthInteraction?: number
  ): Promise<void>;

  abstract flushCache(): Promise<void>;

  abstract syncState(
    contractTxId: string,
    blockHeight: number,
    transactionId: string,
    state: any,
    validity: any
  ): Promise<void>;
}
