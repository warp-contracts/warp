# SmartWeave SDK v2

#### Warning: SDK is currently in alpha version.
#### We do not recommend using it in a production env.

#### Features not yet implemented
- deploying contracts
- arTransfer and tags handling for "viewState" ("interactRead")
- "dry-runs" (though not sure if this should be part of the "core" SDK)
- CLI (though not sure if that is a necessary - even if, should be 
probably a separate lib built on top base SDK).

SmartWeave SDK v2 is the new, rewritten from scratch, SDK implementation proposal for interaction with SmartWeave Contracts.
It has been built with performance (e.g. caching at multiple layers, Arweave calls optimization)
and modularity (e.g. ability to use different types of caches, imported from external libraries) in mind.

Please consider this as a work in progress and use at your own risk :-).

The base motivation behind rewriting SmartWeave SDK (and roadmap proposal) has been described in [README_V2](README_v2.md).  
To further improve contract state evaluation time, one can additionally use AWS CloudFront based Arweave cache described in [AWS CloudFront Cache](https://github.com/redstone-finance/redstone-smartweave-contracts/blob/main/docs/CACHE.md).

- [Installation and import](#installation-and-import)
- [Examples](#examples)
- [Source code structure](#source-code-structure)
    - [contract package](#contract-package)
    - [cache package](#cache-package)
    - [core package](#core-package)
    - [plugins package](#plugins-package)
    - [legacy package](#legacy-package)
    - [logger package](#logger-package)

### Installation and import

`yarn add redstone-smartweave`

You can import the full API or individual modules.

```typescript
import * as SmartWeaveSdk from 'redstone-smartweave'
```

```typescript
import { SmartWeave, Contract, ... } from 'redstone-smartweave'
```

### Examples
Usage examples can be found in
a dedicated [repository](https://github.com/redstone-finance/redstone-smartweave-examples).
Please follow instructions in its README.md (and detail-ish comments in the examples files) to learn more.

### Source code structure
SDK's source code is divided into few main modules.

#### Contract package
Code located in the `contract` package contains base contract interface - `Contract` and its
"reference" implementation - `HandlerBasedContract` - that allows to interact with contracts.
To connect to a contract, first an instance of the `SmartWeave` must be created.
This package contains `SmartWeave` factories that supply some most common configurations (e.g. cached or non-cached).  
Refer the TSDocs for more information.

#### Cache package
Code located in the `cache` package contains base interfaces - `SwCache` and `BlockHeightSwCache`
and some example implementations. These caches can be used while configuring `SmartWeave`
instance - to greatly improve processing speed (i.e. contract's state evaluation)  .
Refer the TSDocs for more information.

#### Core package
Code located in the `core` package contains all the main modules of the reference SDK v2 implementation.
These modules are used to create instances of `SmartWeave`.
There are currently 5 core interfaces:
1. `DefinitionLoader` - it is responsible for loading contract's definition (i.e. its source code, initial state, etc.)
   Its reference implementation is `ContractDefinitionLoader`.
2. `ExecutorFactory` - factory responsible for creating executors that run contract's source code. Its reference implementation is
   `HandlerExecutorFactory` - which produces handlers that run contracts written using the "handle" function.
   In the future - more advanced `ExecutorFactory`ies can be implemented - e.g. such that will allow
   code exception isolation or running contracts written in a more `OOP` style.  
   Please **note** that new SDK version allows calling `viewState` (`interactRead` from the current version) from within the contract source code.
3. `InteractionsLoader` - responsible for loading interaction transactions, with reference implementation in `ContractInteractionsLoader`
4. `InteractionsSorter` - self-explanatory ;-) Two implementations - `LexicographicalInteractionsSorter` - same, as in
   current SDK, and `LexicographicalInteractionsSorter` - based on a PR [https://github.com/ArweaveTeam/SmartWeave/pull/82](https://github.com/ArweaveTeam/SmartWeave/pull/82)
5. `StateEvaluator` - responsible for evaluating the state for a given set of transactions, with reference `DefaultStateEvaluator`.  
   Please **note** that `DefaultStateEvaluator` currently by default doest **not stop** processing in case of any `exception` result type from state evaluation (to be backwards compatible
   with current SDK version) - though we still can't decide whether it is a proper behaviour.
   You can change this behaviour by modifying `EvaluationOptions`.

Additionally, the core package contains the definition of all the tags used by the protocol - `SmartWeaveTags`.

All interfaces and implementations are further described in TSDocs.

#### Plugins package
This package contains some example extensions to base implementation, adding features like "Evolve", caching
capabilities to `InteractionsLoader`, `ExecutorFactory` and `StateEvaluator`, etc.

One cool plugin is the `DebuggableExecutorFactor` - it's a wrapper over `ExecutorFactory` that adds a feature
of changing the contract's code "on the fly" (while evaluating the state) - without the need of deploying anything on Arweave.  
This is really useful while debugging contracts (e.g. quickly adding some console.logs in contract's source code)
or quickly testing new features.

#### Legacy package
This package contains some code from the current SDK implementation - most of 
this code will be probably remove with the future releases of the new SDK implementation.

#### Logger package
TODO: add description
