# SmartWeave v2

### The issues with the current implementation
* low performance (unnecessary calls to Arweave http api, no easy option to add caching layer, etc.)
* no clearly defined base protocol 
* implementation that is really hard (if not impossible...) to unit test
* no tests... :-(((
* many c/p in the code (like the recent "evolve" feature)
* any change in the base function (ie. adding cache) basically requires to make a c/p of the base function
  and add required changes (eg. Kyve's own version of readContract/interactRead functions)
  - this of course makes it really hard to keep the copy-pasted version up to date with base implementation
* sometimes a bit "chaotic" implementation (ie. not sticking to one naming convention, multiple optional function arguments, etc.)

### The "v2" approach
1. Clearly defined core protocol layers/interfaces/tags, etc.
All of this is kept in the "core" directory.
2. OOP implementation
3. Each of the base protocol interface can be easily and independently tested
4. Keep the "core" layer at the bare minimum
5. All additional features (like "evolve" feature or caching or "dry-runs") should build on top of the core layer ("plugins" directory)
6. Option to easily substitute different implementations of the core layers (ie. with or without caching, different ExecutorFactories, etc.)
7. proper use of types in Typescript 
8. strongly typed state and handler's api (generics)

### Roadmap 

#### Phase 1 - in progress
1. Base protocol definition and implementation of the core/protocol layers - done
2. Description of the core building blocks (in the source code) - done
3. Example caching capabilities implementation - done
4. Example "evolve" implementation - done (my concerns re. this feature described in Evolve.ts and in [this analysis](EVOLVE_analysis.md)))
5. Example usage with one of RedStone's contracts - done (call `yarn run v2`)
6. new readContract and interactWrite implementations - done
7. updating the SmartWeaveGlobal definition (with updated readContract version) - done
8. Kyve cache implementation (probably with collaboration with Kyve team) - TODO
9. Verifying output results for X currently "most popular" (with most interactions?) contracts - done for all contracts
10. unit tests for all the core layers and plugins/caches (because screw TDD...;-)) - TODO
11. even more unit tests - TODO
12. did I mention unit tests? TODO
13. release as a separate npm library?

#### Phase 2 - TODO
1. Contract's source code versioning (using standard semantic versioning) - sth. similar to "pragma solidity ^0.8.2;" 
2. Adding ability to call "interactRead" from the contract's source code.

#### Phase 3 - TODO
1. Contract's execution environment isolation

#### Phase 4 - TODO
1. Alternation ExecutorFactory implementations - the one that would allow create handlers for contract's written
in a more OOP approach (so instead one "big" handle function, contract can define its interface and class-based implementation);
