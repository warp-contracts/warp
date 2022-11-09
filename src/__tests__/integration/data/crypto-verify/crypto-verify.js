export async function handle(state, action) {
    const input = action.input;
    const txId = action.input.id;
    const caller = action.caller;
    const content = action.input.content;
    const messages = state.messages;

    if (input.function == 'add') {
        const id = messages.length == 0 ? 1 : messages.length + 1;

        state.messages.push({
          id,
          creator: caller,
          content,
        });
      
        return { state };
    }

    if (input.function == 'verify') {
        const tx = await SmartWeave.unsafeClient.transactions.get(txId);
        const signaturePayload = await tx.getSignatureData();
        const owner = tx.owner;
        const rawSignature = tx.get("signature", {
            decode: true,
            string: false,
          });      

        logger.error('Tx', tx)

        const verified = await SmartWeave.arweave.crypto.verify(
          owner,
          signaturePayload,
          rawSignature
        );

        logger.error('Verified', verified.toString())
        if (verified) {
            state.count +=1
        } else {
            throw new ContractError('Unable to verify.')
        }
        return {state};
    }
}