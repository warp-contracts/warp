# SmartWeave SDK v2

SmartWeave SDK v2 is the new, rewritten from scratch, SDK implementation proposal for interaction with SmartWeave Contracts.
It has been built with performance (e.g. caching at multiple layers, Arweave calls optimization)
and modularity (e.g. ability to use different types of caches, imported from external libraries) in mind.

#### Warning: SDK is currently in alpha version.
We're already using the new SDK on production, both in our webapp and nodes.
However, if you'd like to use it in production as well, please contact us on [discord](https://discord.com/invite/PVxBZKFr46) to ensure a smooth transition and get help with testing.

The base motivation behind rewriting SmartWeave SDK (and roadmap proposal) has been described [here](https://github.com/redstone-finance/redstone-smartweave/blob/main/docs/ROAD_MAP.md).  
To further improve contract state evaluation time, one can additionally use AWS CloudFront based Arweave cache described in [AWS CloudFront Cache](https://github.com/redstone-finance/redstone-smartweave-contracts/blob/main/docs/CACHE.md).

- [Development](#development)
- [Installation and import](#installation-and-import)
- [Examples](#examples)
- [Missing features](#missing-features)
- [Source code structure](#source-code-structure)
    - [core package](#core-package)
    - [contract package](#contract-package)
    - [cache package](#cache-package)
    - [plugins package](#plugins-package)
    - [legacy package](#legacy-package)
    - [logger package](#logger-package)

### Development
PRs are welcome! :-) Also, feel free to submit issues - with both bugs and feature proposals.
Please use [semantic commit messages](https://gist.github.com/joshbuchea/6f47e86d2510bce28f8e7f42ae84c716)

### Installation and import

#### Using npm
`npm install redstone-smartweave`

#### Using yarn
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

### Missing features
The features below are not yet implemented. They will be either added soon to the core SDK, or as 
a separate libraries, built on top of the SDK:
- deploying contracts
- arTransfer and tags handling for "viewState" ("interactRead")
- "dry-runs" (though not sure if this should be part of the "core" SDK)
- CLI (though not sure if that is a necessary - even if, it should be
  probably a separate lib built on top of the base SDK).


### Source code structure
SDK's source code is divided into few main modules.

#### Core package
Code located in the `core` package contains all the main modules of the reference SDK v2 implementation.
These modules are used to create instances of `SmartWeave` - main class that allows to connect to contracts.
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

#### Contract package
Code located in the `contract` package contains base contract interface - `Contract` and its
"reference" implementation - `HandlerBasedContract` - that allows to interact with contracts.
To connect to a contract, first an instance of the `SmartWeave` must be created.
Refer the TSDocs for more information.

#### Cache package
Code located in the `cache` package contains base interfaces - `SwCache` and `BlockHeightSwCache`
and some example implementations. These caches can be used while configuring `SmartWeave`
instance - to greatly improve processing speed (i.e. contract's state evaluation)  .
Refer the TSDocs for more information.

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
