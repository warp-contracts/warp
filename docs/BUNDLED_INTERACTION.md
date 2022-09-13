# Warp Sequencer

This document describes the core concepts behind the Warp Sequencer.

## Introduction

The idea behind Warp Sequencer is to increase the Developer and User Experience.  
Normally, when an interaction with a contract is being sent to Arweave, one have to wait some time:

1. for the transaction mining (~2 minutes)
2. for the proper transaction confirmation (assuming at least 10 blocks - ~20 minutes).

This in total gives ~20-25 minutes, which:

1. Breaks the DX, e.g. in case developer wants to quickly test the contract's functions on mainnet
2. Breaks the UX, e.g. - each user of a given dApp/protocol must wait really long to see the effect
   of an interaction with a contract. This makes the applications effectively unusable - especially for users coming
   from the web2.

Additionally, any interaction with contract requires some amount of ARs in the wallet - which might further increase
the entry barrier, both for developers and given protocol/dApp users.

**NOTE** Waiting for a proper confirmation
is especially important (though often overlooked) in case of a smart contract interactions.  
Imagine a cache, that is evaluating the contracts state for all the interactions returned at any given time by the
default Arweave (arweave.net) gateway.  
If the cache does not wait for the proper transactions' confirmation, it may happen
that it will store a contract state evaluated from the transactions from a forked blocks (or - even worse - from
transactions that were not included in any block).

## Advantages of using Warp Sequencer for interactions posting

1. Interaction is near-instantly available - as soon as proper response from Bundlr network is received.
2. Posting interactions with contract does not require any ARs - the deployment via Bundlr network is either
   fully subsidized by the Arweave (for transactions <= 100KiB) or by the Warp (for transactions > 100KiB).
   The max transaction size is currently 2MiB.  
   Most of the contracts' interactions have the "default" 4B size.
3. Even though the Bundlr transactions are created and signed by the Warp's wallet, it is still possible to identify
   the original transaction owner/signer.  
   **NOTE** This is especially important in case of smart contracts - as contracts' business
   logic very often is dependent on *who* (i.e. what wallet address) is interacting with the contract.
4. The option to use VRF in contracts that require verifiable randomness.
5. Even if the Warp infra will go down, all the contract interactions can be still retrieved directly from Arweave,
   using
   a simple GQL query.

## How it works

Instead of posting the interaction transactions directly to Arweave mainnet, they are sent to Warp Sequencer
(`/gateway/sequencer/register` endpoint) (this is the default behaviour of Warp's SDK `contract.writeInteraction`
function, when `forMainnet` instance is being used).

The Warp Sequencer then:

#### 1. Generates a sort key

A sort key is generated from:

1. current mainnet network height
2. current sequence value
3. original transaction id
4. current mainnet block hash

In the original SmartWeave protocol specification, a *sort key* is defined
as a `[ block_height,sha256(transactionId + blockHash) ]`, where:

1. `block_height` - current network height, l-padded with `0` to 12 chars, e.g. for block height `1015556`, the
   result is `000001015556`
2. `sha256(transactionId + blockHash)` - a `sha256` hash of the concatenated buffers of the transaction id and block
   hash,
   e.g. for txId `UR_35HORbjjZ_NnUqinkZuWkcNB1-gBST3Rezt5JrDs` and block
   hash `ixWCxRN36DjVUxQRa68xIeoZLfvLDTtX78e0ae8RAAJjOPpDBuVKVaEKYOpq7bLS`,
   the result is `44edd70f2018924f22a878a558a8f2d5cae8bc1f718d567df43bf52b6384d260`.

The complete *sort key* for the above values would
be: `000001015556,44edd70f2018924f22a878a558a8f2d5cae8bc1f718d567df43bf52b6384d260`.

The generated sort keys are then used by the SmartWeave protocol to lexicographically sort the transactions.

The Warp Sequencer extends this default mechanism by the current sequence value.  
The formula for the *sort key* is extended to:
`[ block_height,sequence_value,sha256(transactionId + blockHash) ]`

This sequence value can be obtained from the Sequencer's node timestamp, database or other sources.
In its current implementation - a Sequencer node timestamp value is being used.  
This in effect gives a fair transactions ordering - the transactions will have the sequence assigned in order in which
they are processed by the Sequencer.

Assuming transaction id `La_NpAFAWxGj-VIiLfg7NbBfox0RZ8uuEJSOOZykd48`, block
hash `-o88tFYsMG9RXSGcNXX5sVDuSV5uHy7zuFRj6vYo91e3mXpmng6qw322Ip0-EguA`,
block height `1015560` and current Sequencer value `1663069424541`, the generated *sort key* would
be `000001015560,1663069424541,a21ac8a60326ba8c2bb8caa05cff3334a22e9960ef55de0b5392caa30b484d0a`

**NOTE** All the transactions sent to Arweave directly, have the sequence value assigned to `0000000000000000`.
This effectively means that if transactions to a given contract are sent both directly to Arweave mainnet and Warp
Sequencer -
if two transactions happen to be at the same block height, the "direct" Arweave transactions take precedence.
This also means that the sequencing algorithm is fully backwards compatible with the original SmartWeave protocol.

#### 2. Generates tags for the Bundlr transaction

| Tag Name                                    | Tag Value                                                     |
|---------------------------------------------|---------------------------------------------------------------|
| `Sequencer`                                 | `RedStone`                                                    |
| `Sequencer-Owner`                           | The original owner/signar of the contract transaction         |
| `Sequencer-Mills`                           | The sequence value used by the Sequencer for this transaction |
| `Sequencer-Sort-Key`                        | The generated sort key for this transaction                   |
| `Sequencer-Tx-Id`                           | The original transaction id                                   |
| `Sequencer-Block-Height`                    | The block height used for generating the sort key             |
| `Sequencer-Block-Id`                        | The block hash used for generating the sort key               |
| ...all the tags of the original transaction |                                                               |

Additional set of tags are added in case user requests generating a random value using VRF (Verifiable Random Function):

| Tag Name | Tag Value                                                              |
|---------------------------------------------|------------------------------------------------------------------------|
| `vrf-index`                                 | The original hash generated by the VRF (using `sort_key` as input data)|
| `vrf-proof`                           | The original proof generated by the VRF                                |
| `vrf-bigint`                           | A BigInt value evaluated from the hash generated by the VRF            |
| `vrf-pubkey`                        | The public key used by the VRF                                         |

Verifiable randomness can be used by contracts that require using random values - e.g. gaming contracts, nft/loot
generating contracts, etc.
Using the `sort_key`, `vrf-proof` and `vrf-pubkey`, the client can always verify the generated random value.

#### 3. Uploads the original transaction to Bundlr

..with tags generated in point 2.

**NOTE** The original transaction is not modified in any way - this is to preserve the original
signature!

After receiving proper response and recipes from Bundlr, the Warp gateway indexes the contract interaction
internally - to make it instantly available.

#### 4. Finally, the Warp gateway returns the response from the Bundlr to the client.

## Contract transaction retrieval (generated by the Warp Sequencer) via Arweave gateway

Use the GQL endpoint, with the original contract tx id passed in the `Contract` tag. Note that all the
interactions will be part of a bundle (i.e. will have the `edges.node.bundledIn.id` value set).

```qql
query {
  transactions(
    tags: [
      {name: "App-Name", values: ["SmartWeaveAction"]},
      {name: "Contract", values: ["KT45jaf8n9UwgkEareWxPgLJk4oMWpI5NODgYVIF1fY"]},
      {name: "Sequencer", values: ["RedStone"]}
    ]
  ) {
    edges {
      node {
          id
          tags {
            name
            value
          }
          block {
            height
          }
          bundledIn {
            id
          }
        }
    }
  }
}
```

## Contract transaction retrieval via Warp gateway

The Warp `/gateway/v2/interactions-sort-key` endpoint allows to retrieve all the given contract interactions currently
indexed by the Warp Gateway - both the direct Arweave transactions and Warp Sequencer transactions.
This method is used by the default by the Warp SDK - in case of `forMainnet` instance is being used.

## Futher development
1. Blind/trustless sequencing - https://github.com/warp-contracts/gateway/issues/48
2. Sequencer decentralization - https://github.com/warp-contracts/gateway/issues/93