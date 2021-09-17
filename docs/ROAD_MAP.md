# RedStone SmartContracts SDK

### The issues with original smartweave.js SDK
* low performance (unnecessary calls to Arweave http api, no easy option to add caching layer, etc.)
* no clearly defined base protocol 
* implementation that is really hard (if not impossible...) to unit test
* no tests, very prone to errors (eg. recent issue with input tags format)
* many c/p in the code (like the recent "evolve" feature)
* any change in the base function (i.e. adding cache) basically requires to make a c/p of the base function
  and add required changes (eg. Kyve's own version of readContract/interactRead functions)
  - this of course makes it really to maintain and keep the code up to date with base implementation
* sometimes a bit "chaotic" implementation (i.e. not sticking to one naming convention, multiple optional function arguments, etc.)

### The "RedStone SmartContracts" approach
1. Clearly defined core protocol layers/interfaces/tags.
2. OOP implementation
3. Each of the base protocol interface can be easily and independently tested
4. The "core" layer should be kept at a bare minimum - to reduce the risk of mistakes in core protocol implementation.
5. All additional features (like "evolve" feature or caching or "dry-runs") should build on top of the core layer ("plugins")
6. Option to easily substitute different implementations of the core layers (ie. with or without caching, different ExecutorFactories, etc.)
7. proper use of types in Typescript 
8. strongly typed state and handler's api (i.e. generics)

### Roadmap 

#### Phase 1 - in progress
1. Base protocol definition and implementation of the core/protocol layers - done
2. Description of the core building blocks (in the source code) - done
3. Example caching capabilities implementation - done
4. Example "evolve" implementation - done (my concerns re. this feature described in Evolve.ts and in [this analysis](EVOLVE_analysis.md)))
5. Example usage with one of RedStone's contracts - done
6. new readContract and interactWrite implementations - done
7. release as a separate npm library - done
8. updating the SmartWeaveGlobal definition (with updated readContract version) - done
9. Adding ability to call "interactRead" from the contract's source code. - done
10. Kyve cache implementation (probably with collaboration with Kyve team) - done
11. Verifying output results for X currently "most popular" (with most interactions?) contracts - done for all contracts
12. regression tests - done
13. integration tests - done
14. documentation, migration guide, usage examples for node and web env., tutorial - done
15. unit tests for all the core layers and plugins/caches - in progress

#### Phase 2 - TODO
1. Contract's execution environment isolation
2. Generating a stack trace from all the contract interactions

#### Phase 3 - TODO
1. Contract's source code versioning (using standard semantic versioning) - sth. similar to "pragma solidity ^0.8.2;"
2. Alternation ExecutorFactory implementations - the one that would allow create handlers for contract's written
   in a more OOP approach (so instead one "big" handle function, contract can define its interface and class-based implementation);

#### Phase 4 - TODO
Thing on top of the SDK eg:
1. Custom Gateway, optimized for interactions with SmartWeave contracts
2. Custom Viewblock-like contracts explorer
