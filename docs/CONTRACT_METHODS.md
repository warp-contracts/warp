# SmartWeave SDK v2 - Contract methods

- [Contract Methods](#contract-methods)
  - [`connect`](#connect)
  - [`setEvaluationOptions`](#setevaluationoptions)
  - [`readState`](#readstate)
  - [`viewState`](#viewstate)
  - [`writeInteraction`](#writeinteraction)

## Contract Methods

### `connect`

```typescript
async function connect(wallet: ArWallet): Contract<State>
```

Allows to connect wallet to a contract. Connecting a wallet MAY be done before "viewState" (depending on contract implementation, ie. whether called contract's function required "caller" info) Connecting a wallet MUST be done before "writeInteraction".

- `wallet`        a JWK object with private key or 'use_wallet' string.

<details>
  <summary>Example</summary>

  ```typescript
  const contract = smartweave
    .contract("YOUR_CONTRACT_TX_ID")
    .connect(jwk);
  ```
</details>

---

### `setEvaluationOptions`

```typescript
function setEvaluationOptions(options: Partial<EvaluationOptions>): Contract<State>
```

Allows to set (EvaluationOptions)


- `options`                         the interaction input
  - `options.ignoreExceptions`      enables exceptions ignoring
  - `options.waitForConfirmation`   enables waiting for transaction confirmation

<details>
  <summary>Example</summary>

  ```typescript
  const contract = smartweave
    .contract("YOUR_CONTRACT_TX_ID")
    .setEvaluationOptions({
      waitForConfirmation: true,
      ignoreExceptions: false,
    });
  ```
</details>

---


### `readState`

```typescript
async function readState(blockHeight?: number, currentTx?: { contractTxId: string; interactionTxId: string }[]): Promise<EvalStateResult<State>>
```

Returns state of the contract at required blockHeight. Similar to the `readContract` from the version 1.

- `blockHeight`        Block height for state
- `currentTx`          If specified, will be used as a current transaction

<details>
  <summary>Example</summary>

  ```typescript
  const { state, validity } = await contract.readState();
  ```
</details>

---

### `viewState`

```typescript
async function viewState<Input, View>(input: Input, blockHeight?: number, tags?: Tags, transfer?: ArTransfer): Promise<InteractionResult<State, View>>
```

Returns the "view" of the state, computed by the SWC - ie. object that is a derivative of a current state and some specific smart contract business logic. Similar to the `interactRead` from the current SDK version.

- `input`                the interaction input
- `blockHeight`          if specified the contract will be replayed only to this block height
- `tags`                 an array of tags with name/value as objects
- `transfer`             target and winstonQty for transfer

<details>
  <summary>Example</summary>

  ```typescript
  const { result } = await contract.viewState<any, any>({
    function: "NAME_OF_YOUR_FUNCTION",
    data: { ... }
  });
  ```
</details>

---

### `viewStateForTx`

```typescript
async function viewStateForTx<Input, View>(input: Input, transaction: InteractionTx): Promise<InteractionResult<State, View>>
```

A version of the viewState method to be used from within the contract's source code. The transaction passed as an argument is the currently processed interaction transaction. The "caller" will be se to the owner of the interaction transaction, that requires to call this method.

💡 Note! calling "interactRead" from withing contract's source code was not previously possible - this is a new feature.

- `input`                the interaction input
- `transaction`          interaction transaction

<details>
  <summary>Example</summary>

  ```typescript
  const { result } = await contract.viewStateForTx<any, any>({
    function: "NAME_OF_YOUR_FUNCTION",
    data: { ... }
  }, transaction);
  ```
</details>

---

### `writeInteraction`

```typescript
async function writeInteraction<Input>(input: Input, tags?: Tags, transfer?: ArTransfer): Promise<string>
```

Writes a new "interaction" transaction - ie. such transaction that stores input for the contract.

- `input`         the interaction input
- `tags`          an array of tags with name/value as objects
- `transfer`      target and winstonQty for transfer

<details>
  <summary>Example</summary>

  ```typescript
  const result = await contract.writeInteraction({
    function: "NAME_OF_YOUR_FUNCTION",
    data: { ... }
  });
  ```
</details>

---

### Need help? 🙋‍♂️
Please feel free to contact us [on Discord](https://redstone.finance/discord) if you face any problems.

