/* eslint-disable */
import { defaultCacheOptions, LoggerFactory, WarpFactory } from '../src';
import fs from 'fs';
import path from 'path';
import { JWKInterface } from 'arweave/node/lib/wallet';

async function main() {
  let wallet: JWKInterface = readJSON('./.secrets/33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA.json');
  LoggerFactory.INST.logLevel('debug');
  const logger = LoggerFactory.INST.create('verify');

  try {
    const warp = WarpFactory.forMainnet({ ...defaultCacheOptions, inMemory: true });

    const jsContractSrc = fs.readFileSync(path.join(__dirname, 'dist/verify.js'), 'utf8');
    const initialState = fs.readFileSync(path.join(__dirname, 'data/js/verify.json'), 'utf8');

    const { contractTxId } = await warp.createContract.deploy({
      wallet,
      initState: initialState,
      src: jsContractSrc
    });

    console.log(contractTxId);

    const contract = warp.contract<any>(contractTxId).connect(wallet)
      .setEvaluationOptions({ allowBigInt: true, useVM2: true });

    await Promise.all([
      contract.writeInteraction<any>({
        function: 'arweave',
        signatureData: {
          function: 'registerSchema',
          schemaId: 'address',
          address: '3JYIY-6Tgt5GaKn1wCHTaXdxe7ybG1OO1we7xQAyX8Q',
          type: 'datapod',
          dataIdCaller: 'context',
          nonce: 1
        },
        nonce: 1,
        dataId: 'context',
        publicKey:
          'w3SSf4N5OvqAXpee4fEe-T0KHvxJJ6VNchA3-TFEXDTSoO9YtC2B6QbuIK0IIzviuk4TYTZUAuSy3BwOm7nE7yWGwGrPw7I-9Q7KM0J0GeOg0taZv7GOUaL4zv0iNViqXtMbwwyTqCvGG3cEddx_amrPYCHGvk9LsuzsSECxrCZHZZybRNTOEpZyLuD-awlUMzosrRAK5eKtg-24HgDbx9PcWAaVG0Y926hIMw5FQ__SHQmls4RKXLPmWsHdbuyIOU_OFgH6AT4najEzL2cNYU8RlpNddrg0GMrAbGfnaNt6jiFFagvVOMahXU7OWl7d42Om7zG7evd9ugygo2qAj1tRwos87R5ghmJz0-Tn1b3jVrUc8GiJLsSwRiX3oJFjOK4eypTQtrsoP0vruC_H1rLZEwU-FyN1MFLmNU_ovO0QP1xXQaFPDHi7BNfzTmhnaEQMQmg9nDfi94fgxxCGfsf0C-Yppi_lC24XGjU08iANWjJPxmEkkgZk3ji9nxNmUHWHD6sLzPPvpZ4XU-HUV4qC2lygxEz5vv6bUKmssJmk6jPy8yRMFCVSq9YhmTZYCB5XJQTYx-Kls8p-sxCHitRWtuWyqB7dVVzRC3-RVTZ_kwtGI5gzqvjLQBu23bN6iF54Q985YuAiYjmuLsAoL_gWu-7Z56YxGBnMJ9qVgc8',
        signature:
          'PxjyCoU8DHz34mv1q2mUlzaNyjbwCkY4aP40DO6UYbPoFL6C6iCVsdBZn4ugfWQLHI2MeNPgZAteq4bghRDy9uEfEHkwIZivyWmwI0XkjfQIecBMa5NW4MRv6eC2OakBKW+InsJ9TrLOzxj/wFqg8GzD6y1rnZWdFhthq9UVqWNM4jmVQ2xwgxNaSsXZKrurfT63bBdJB7vGSWgEWaHde7NdwZEuH2csNof+QZ9mnKFNr/yoNJq4z74WK/TQ3KvuePZUKLcESRZ6wt7GXfaZbY3cLySu15tTjQqgvW3+40eEZ8814OF/G2l+TCvJ08HLDDwpQRa7ZWeNmgSkpDPB94cCLtGUvGnwsV1O1EngrmlWSSkRN01GwHE09DPNvTkukNHm9WOX1BrDXwHiDRznZgdGN/H05TwfpC5Nt5FvXWb5oE5togLo0UTZ6n5Fc5qTheGzit5IstYro59N/paBZoOQlaPRav8SL9H5z3AUkgynijDVFuK3i5oy6AO7KjsLYeF8Az/I1SvU24sdISvap9pgIlhYqVEj/ShgWEyHU74fzcu6cND98h3zzK/udxKnaNfVR8OoS1McJytk+UKyPAXn/Q6seiuq+zh1mLebSA+rS8zJWOm0J2GJp8ge2YbH88AFGHQHo1lRhu87oPGH4JydWH2HLAQdfnR+Gl4vgw0='
      }),
      contract.writeInteraction<any>({
        function: 'ethers',
        signature:
          '0xddd0a7290af9526056b4e35a077b9a11b513aa0028ec6c9880948544508f3c63' +
          '265e99e47ad31bb2cab9646c504576b3abc6939a1710afc08cbf3034d73214b8' +
          '1c',
        message: 'hello world',
        signingAddress: '0x14791697260E4c9A71f18484C9f997B308e59325'
      })

    ]);

    const { cachedValue } = await contract.readState();

    logger.info('Result');
    console.dir(cachedValue.state);
  } catch (e) {
    logger.error(e);
  }
}

export function readJSON(path: string): JWKInterface {
  const content = fs.readFileSync(path, 'utf-8');
  try {
    return JSON.parse(content);
  } catch (e) {
    throw new Error(`File "${path}" does not contain a valid JSON`);
  }
}

main().catch((e) => console.error(e));
