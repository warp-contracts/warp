### Evolve feature

#### Concerns
Currently, it is partly implemented in the contract source code and
partly in the "protocol" itself. Shouldn't such features be rather fully implemented at the "protocol"
level, so that its users won't have to clutter their contract's code/state with evolve-related stuff?
And what if there's some bug or change in the implementation - will all the evolve feature users have
to update theirs contract source code?
Plus - currently, I don't see an easy way to retrieve and audit all the contract's source code versions - without
the need to analyse its interaction transactions.


#### Alternative implementation proposal
1. Define new protocol tags - `Base-Contract-Tx-Id`, `Updated-Contract-Src-Tx-Id` (I think the names are self-explanatory);
2. Define new SDK method - "updateContract" with signature:
   `updateContract(baseContractTxId: string, updatedContractSourceTxId: string, wallet: JWKInterface)`
   This new method would:
    1. verify that the `owner` of the `baseContractTxId` is the same as the address of the passed `wallet`. If not, it throws an exception
       (so basically only contract's owners are allowed to update the contract's source code).
    2. Create new arweave transaction with newly specified tags.

3. Then - while interacting with the contract, the protocol would need to:
    1. fetch all the source code versions up to the requested block height (using rather simple GQL) - in the new version this would be
       handled by the `DefinitionLoader` layer - the `ContractDefinition` object, that it returns, would simply have to store a Map (blockHeight -> src).
       An additional safety check can be also added here (that would verify that the owner of the "updateContract" transaction is the same as the contract's owner).
    2. The `ExecutionContext` would need similarly store a Map (blockHeight -> handler)
    3. The `StateEvaluator` layer would then for each interaction transaction choose (based on the interaction block height - using a really simple algorithm) proper source code version from the `ExecutionContext`

This would allow to fully implement (and test...) this at a protocol level and have a clear and easy way of retrieving all the contract's source code versions (using GQL and new tags).
Additionally - the `StateEvaluator` layer would not be responsible for loading and overwriting the contract's source code
(I believe this should be the responsibility of the `DefinitionLoader` layer).
Last-but-not-least - there would be no need to add any "evolve" specific source code to the contract's source code itself.
