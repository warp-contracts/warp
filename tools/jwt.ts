import {defaultCacheOptions, WarpFactory, WarpPlugin, WarpPluginType} from "../src";
import jwt from 'jsonwebtoken';
import {JWKInterface} from "arweave/node/lib/wallet";
import {readJSON} from "./deploytest";

class JWTPlugin implements WarpPlugin<any, void> {
  process(input: any): void {
    input.jwt = jwt;
  }

  type(): WarpPluginType {
    return 'smartweave-extension-jwt';
  }
}

async function wowSuchJWTPlugin(): Promise<void> {
  console.log(jwt);

  const wallet: JWKInterface = readJSON('./.secrets/33F0QHcb22W7LwWR1iRC8Az1ntZG09XQ03YWuw2ABqA.json');

  const contractSrc =
    `
    export async function handle(state, action) {
      if (action.input.function === 'jwt') {
        const token = SmartWeave.extensions.jwt.sign({ foo: 'bar' }, action.caller);
        state[action.caller] = token;
        
        return {state};
      }
    }
    `

  const warp = WarpFactory
    .forMainnet({...defaultCacheOptions, inMemory: false})
    .use(new JWTPlugin());

  const {contractTxId} = await warp.deploy({
    wallet,
    initState: JSON.stringify({}),
    src: contractSrc,
  });

  const contract = await warp.contract(contractTxId).connect(wallet);
  await contract.writeInteraction({function: 'jwt'});

  const {cachedValue} = await contract.readState();

  console.log(cachedValue.state);
}

wowSuchJWTPlugin().finally();