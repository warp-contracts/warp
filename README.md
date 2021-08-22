# SmartWeave SDK v2

SmartWeave SDK v2 is the new, rewritten from scratch, SDK implementation proposal for interaction with SmartWeave Contracts.
It has been built with performance (e.g. caching at multiple layers, Arweave calls optimization)
and modularity (e.g. ability to use different types of caches, imported from external libraries) in mind.

Please consider this as a work in progress and use at your own risk :-).

The base motivation behind rewriting SmartWeave SDK (and roadmap proposal) has been described in [README_V2](README_v2.md).  
To further improve contract state evaluation time, one can additionally use AWS CloudFront based Arweave cache described in [AWS CloudFront Cache](https://github.com/redstone-finance/redstone-smartweave-contracts/blob/main/docs/CACHE.md).

- [Installation and import](#installation-and-import)
- [Source code structure](#source-code-structure)
    - [cache package](#cache-package)
    - [client package](#client-package)
    - [core package](#core-package)
    - [plugins package](#plugins-package)
- [Example usages](#example-usages).


### Installation and import
V2 of the SDK is not currently available on npm.
The SmartWeave SDK v2 can be installed directly from the gitHub repository.

`yarn add redstone-smartweave`

To quickly update to the latest version, run:

You can import the full API or individual modules.

```typescript
import * as SmartWeaveSdk2 from '@smartweave'
```

```typescript
import { swcClient, HandlerBasedSwcClient, ... } from '@smartweave'
```

### Source code structure
The new SDK is currently a part of the current SDK.
All the new source code is kept in the `src/v2` directory.

#### Client package
Code located in `client` package contains base client interface - `SwcClient` and its
"reference" implementation - `HandlerBasedSwcClient` - that allows to interact with contracts.
It also contains `SwClientFactory` that supplies some most common `HandlerBasedSwcClient` configurations (e.g. cached or non-cached).  
Refer the TSDocs for more information.

#### Cache package
Code located in `cache` package contains base interfaces - `SwCache` and `BlockHeightSwCache`
and some example implementations. These caches can be used while configuring [`SwcClient`](#swcclient-interface)
implementation - to greatly improve processing speed (i.e. contract's state evaluation)  
Refer the TSDocs for more information.

#### Core package
Code located in the `core` package contains all the main building blocks of the reference SDK v2 implementation.
These building blocks are then used to create instances of `HandlerBasedSwcClient`.
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
   Please **note** that `DefaultStateEvaluator` currently by default **stops** processing in case of any `exception` result type from state evaluation (as opposed to
   current SDK version, which simply skips the exception and moves to next interaction transaction).
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

### Example usages
A separate repo with examples is available at [https://github.com/redstone-finance/redstone-smartweave-examples](https://github.com/redstone-finance/redstone-smartweave-examples).
Follow instructions in its README.md to learn more.
