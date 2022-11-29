import { ethers } from 'ethers';

export async function handle(state, action) {
  const input = action.input;

  if (input.function == 'arweave') {
    const str = JSON.stringify({ signatureData: input.signatureData, nonce: input.nonce, dataId: input.dataId });
    const text = Buffer.from(str);
    const publicKey = input.publicKey;
    const sig = new Uint8Array(Buffer.from(input.signature, 'base64'));
    const verified = await SmartWeave.arweave.crypto.verify(publicKey, Buffer.from(text), sig);
    // logger.info('Arweave verified', verified);
    if (verified) {
      state.countArweave += 1;
    } else {
      throw new ContractError('Invalid Arweave signature.');
    }
    return { state };
  }

  if (input.function == 'ethers') {
    const signingAddress = ethers.utils.verifyMessage(input.message, input.signature);

    if (signingAddress == input.signingAddress) {
      state.countEthers += 1;
    } else {
      throw new ContractError(`Invalid EVM signature.`);
    }
    // logger.info('EVM verified', signingAddress == input.signingAddress);

    return { state };
  }

  throw new ContractError(`No function supplied or function not recognised: "${input.function}"`);
}
