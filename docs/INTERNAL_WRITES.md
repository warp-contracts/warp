# Warp Internal Contract Writes

This document describes the core concepts behind the Warp Internal Writes - a SmartWeave protocol
extension that allows to perform inner-contract writes.

### Introduction

SmartWeave protocol currently natively does not support writes between contracts - contract can only read each other's state.  
This lack of interoperability is a big limitation for real-life applications - especially if you want to implement features like staking/vesting, disputes - or even a standard approve/transferFrom flow from ERC-20 tokens.

Some time ago a solution addressing this issue was proposed - a [Foreign Call Protocol](https://www.notion.so/Foreign-Call-Protocol-Specification-61e221e5118a40b980fcaade35a2a718).

This is a great and innovative idea that greatly enhances contracts usability, but we've identified some issues:

- Contract developers need to add FCP-specific code in the smart contract code and in its state. This causes the protocol code to be mixed with the contract's business logic. Additionally - any update or change in the protocol would probably require the code (and/or state) of all the contracts that are utilizing the FCP, to be upgraded.
- security - e.g. without adding additional logic in the `invoke` function - any user can call any external contract function
- In order to create a "write" operation between FCP-compatible contracts (e.g. `Contract B` makes a write on a `Contract A`), users need to create two separate transactions:
1. `invoke` operation on Contract B to add entry in the `foreignCalls` state field of the Contract B (this entry contains the details of the call on the Contract A )
2. `readOutbox` operation on Contract A, that underneath reads Contract's B `foreignCalls` and "manually" calls Contract's A `handle` function for each registered 'foreignCall'

We believe that writes between contracts should be implemented at the protocol level (i.e. contract source code and its state should not contain any technical details of the internal calls) and that performing a write should not require creating multiple interactions.


### Solution
1. Attach a new method to the `SmartWeave` global object (the one that is accessible from the contract's code) with a signature:  
   ```ts
   function write<Input = unknown>(
      contractId: String,
      input: Input,
      throwOnError?: boolean): Promise<InteractionResult>
   ```  
   This method allows to perform writes on other contracts.
   The `caller` of such call is always set to the `txId` of the calling contract - this allows the callee contract to decide whether call should be allowed.
   The method first evaluates the target (i.e. specified by the `contractTxId` parameter) contract's state up to the "current" sort key (i.e. sort key of the interaction that is calling the `write` method) and then applies the input (specified as the 2nd. parameter of the `write` method).
The result is memoized in cache.  
If the internal write will fail (i.e. return result object with `type` different from `ok`), the original transaction will also automatically fail (i.e. will return `error` as a result type).
If you need to manually handle the write errors in the contract's code, either switch off this behaviour globally - via `evalulationOptions.throwOnInternalWriteError`; or for a single call - by passing `false` as a `throwOnError` argument in the `write` function.

This has been implemented in the `Contract.dryWriteFromTx()` and `ContractHandlerApi.assignWrite()`;

2. For each newly created interaction with given contract (i.e. when `contract.writeInteraction` is called) - the SDK performs a dry run and analyzes the call report of the dry-run 
(feature introduced in https://github.com/redstone-finance/redstone-smartcontracts/issues/21).  
The result of this [analysis](https://github.com/warp-contracts/warp/blob/main/src/contract/InnerWritesEvaluator.ts#L3) is a list of all inner write calls between contracts for the newly created interaction.
For each found inner write call - the SDK generates additional tag:
   `{'interactWrite': contractTxId}`- where `contractTxId` is the callee contract.

This has been implemented in the `Contract.writeInteraction` and `InnerWritesEvaluator.eval()`.

3. For each state evaluation for a given contract ("Contract A"):
- load all "direct" interactions with the contract
- load all "internal write" interactions with the contract (search using the `interactWrite` tag)
- concat both type of transactions and sort them according to protocol specification (i.e. lexicographically using the `sortKey`)
- for each interaction:
1. if it is a "direct" interaction - evaluate it according to current protocol specification
2. if it is an "internalWrite" interaction - load the contract specified in the "internalWrite" ("Contract B") tag and evaluate its state. This will cause the `write` (described in point 1.) method to be called. After evaluating the "Contract B" contract state - load the latest state of the "Contract A" from cache (it has been updated by the `write` method) and move to next interaction.

This has been implemented in the `DefaultStateEvaluator.doReadState()`

This method is also effective for "nested" writes between contracts (i.e. Contract A writes on Contract B, Contract B writes on Contract C, etc...) and 'write-backs' (i.e. Contract A calls a function on Contract B which calls a function on Contract A).    

### Examples
Some examples of different types of inner contract writes are available:
1. In the DEX [tutorial](https://academy.warp.cc/tutorials/dex/introduction/intro) 
2. The ERC-20 [staking](https://github.com/warp-contracts/wrc/blob/master/examples/staking/src/actions/staking.rs#L35) example.
3. In the integration [tests](https://github.com/warp-contracts/warp/tree/main/src/__tests__/integration/internal-writes) of the inner writes feature.  
**NOTE** Do not overuse the inner writes feature - as it can quickly make the debugging and contracts' interaction analysis very difficult.

### Security
1. The internal contract writes is switched off by default. Developer must explicitly set the `evaluationOptions.internalWrites` flag to true to use this feature.
2. We strongly suggest to create a whitelist of contracts which are allowed to perform a write on a contract.
The id of the calling contract can be obtained from `SmartWeave.caller`.
3. The SDK by default limits the evaluation time of the given interaction to 60s. This can be changed via `evaluationOptions.maxInteractionEvaluationTimeSeconds`
4. The SDK by default limits the max depth of inner contract interactions (reads of writes) to `7`. This can be changed via `evaluationOptions.maxCallDepth`.
5. The SDK gives an option to set a gas limit for each interaction (note that this applies only to WASM contracts!) via  `evaluationOptions.gasLimit`.
6. We strongly suggest using WASM (Rust preferably) for writing inner writes compatible contracts - as the WASM sandboxing
and option to set gas limits gives the best security.

### Example inner write call flow
Contract `Contract B` makes an internal write on contract `Contract A` at interaction `i(n)`.

**(1)** Evaluator loads the state of the `Contract A` up to internal write interaction `i(n)`.  
**(2)** `i(n)` is an internal write interaction. Thanks to tag data saved in the interaction, the evaluator
   knows that it is `Contract B` which makes write on `Contract A`.  
   Evaluator saves the `Contract A` state at `i(n-1)` interaction in cache (the key of the cache is a sort key of the transaction, for which the state is being stored).  
**(3)** Evaluator loads the `Contract B` contract and evaluates its state up to `i(m)` interaction.  
**(4)** `i(m)` interaction for `Contract B` is making a `SmartWeave.contracts.write` call on `Contract A` with certain `Input`.  
**(5)** In order to perform the write, evaluator loads the `Contract A` contract state at `i(n-1)` transaction from cache.  
**(6)** Evaluator applies the input from the `SmartWeave.contracts.write` on the `Contract A` (i.e. calls its `handle` function with this input)  
**(7)** Evaluator stores the result of calling the `Contract A` `handle` function in cache.  
**(8)** Evaluator returns with the evaluation to the `Contract A` contract. If first loads the state stored in point (7) and then
   continues to evaluate next interactions.

```
                           Contract A - the callee contract

                           ┌───────────────────────────┐
                           │    Interaction            │
                           │    i(n-2)                 │
                           └───────────┬───────────────┘
                                       │
                                       │
                                       ▼
                           ┌───────────────────────────┐
                           │    Interaction            │      Save State (2)
                           │    i(n-1)                 ├────────────────────────────────────────┐
                           └───────────┬───────────────┘                                        │
                                       │                                                        │
                                       │ (1)                                                    │
                                       ▼                                   CACHE                │
                           ┌───────────────────────────┐                   ┌────────────┬───────▼──────┐
                           │    Interaction            │     (3)           │            │State[i(n-1)] ├───────┐
   This tx contains        │    i(n):internal write    ├───────────────┐   │ Contract A ├──────────────┤       │
   tag 'internal-write'    │         from "Contract B" │               │   │            │State[i(n)]   │◄──────┼─┐
   with value 'Contract B' └───────────┬───────────────┘               │   └────────────┴─────────┬────┘       │ │
                                       │                               │                          │            │ │
                                       │                               │                          │            │ │
                                       ▼                               │                          │            │ │
                           ┌───────────────────────────┐(8)            │     Load State           │            │ │
                           │    Interaction            │◄──────────────┼──────────────────────────┘            │ │
                           │    i(n+1)                 │               │                                       │ │
                           └───────────────────────────┘               │                                       │ │
                                                                       │                                       │ │
                ──────────────────────────────────────────────────     │                                       │ │
                                                                       │                                       │ │
                           Contract B - the caller contract ◄──────────┘                                       │ │
                           ┌───────────────────────────┐                                                       │ │
                           │    Interaction            │                                                       │ │
                           │    i(m-1)                 │                                                       │ │
                           └───────────┬───────────────┘                                                       │ │
                                       │                                                                       │ │
                                       ▼                        SmartWeave.contracts.write('Contract A', input)│ │
This tx calls              ┌───────────────────────────┐(4)          ┌─────────────────────────────┐           │ │
Contract B function        │    i(m):write on          │             │                             │           │ │
that makes                 │         Contract A        ├─────────────►                          (5)│           │ │
SmartWeave.contract.write()└───────────────────────────┘             │   ┌─────────────────────┐ Load State    │ │
call on Contract A.        NOTE: i(m) = i(n) - i.e. it is the same   │   │ 1. Load Contract A  │◄──┬───────────┘ │
                           transaction.                              │   │    State[i(n-1)]    │   │             │
                                                                     │   └─────────────┬───────┘   │             │
                                                                     │           (6)   │           │             │
                                                                     │   ┌─────────────▼───────┐   │             │
                                                                     │   │ 2. Call Contract A  │ Save State  (7) │
                                                                     │   │    "handle" function├───┬─────────────┘
                                                                     │   │    with "input"     │   │
                                                                     │   └─────────────────────┘   │
                                                                     │                             │
                                                                     └─────────────────────────────┘
```

### Alternative solution
An alternative solution has been also considered.
Instead of writing only a tag with id of the calling contract, one could write the exact input (i.e. function, parameters, etc) of the call.
This would have an advantage of the increased performance (as we could evaluate the "Contract A" state without the need of evaluating the "Contract B" state in the process),
but would ruin the "lazy-evaluation" idea of the protocol and reduce the safety of the solution - as the Contract A would need to fully trust the calling Contract B - if the Contract B would save some unsafe data in the input - there would be no way to exclude it from the execution.
