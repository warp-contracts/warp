import ArLocal from "arlocal";
import Arweave from "arweave";
import { EvalStateResult, SortKeyCacheResult, SourceType, WarpFactory, defaultCacheOptions, defaultWarpGwOptions, sleep } from "../src";
import fs from 'fs';
import path from 'path';
import { ArweaveSigner } from "warp-arbundles";
import { DeployPlugin } from "warp-contracts-plugin-deploy";

interface ExampleContractState {
    counter: number;
}

async function main() {
    // const gwUrl = 'http://localhost:5666';
    const gwUrl = 'http://35.242.203.146:5666';
    // const gwUrl = 'https://gw.warp.cc';
    const arweavePort = 1983;
    const arlocal = new ArLocal(arweavePort, false);

    try {
        await arlocal.start();
        const arweave = Arweave.init({
            host: 'localhost',
            port: arweavePort,
            protocol: 'http'
        });

        const cacheOptions = {
            ...defaultCacheOptions,
            inMemory: true
        }
        const gatewayOptions = { ...defaultWarpGwOptions, source: SourceType.WARP_SEQUENCER, confirmationStatus: { notCorrupted: true } }

        const warp = WarpFactory
            .custom(arweave, cacheOptions, 'custom')
            .useWarpGateway(gatewayOptions, cacheOptions)
            .build()
            .use(new DeployPlugin())
            .useGwUrl(gwUrl)

        const contractSrc = fs.readFileSync(path.join(__dirname, '../src/__tests__/integration/data/example-contract.js'), 'utf8');
        const initialState = fs.readFileSync(path.join(__dirname, '../src/__tests__/integration/data/example-contract-state.json'), 'utf8');
        const wallet = (await warp.generateWallet()).jwk;
        const { contractTxId } = await warp.deploy({
            wallet: new ArweaveSigner(wallet),
            initState: initialState,
            src: contractSrc
        });
        const contract = warp.contract<ExampleContractState>(contractTxId).setEvaluationOptions({
            waitForConfirmation: true
        });
        contract.connect(wallet);

        const initCounter = 555;
        const numberOfInteractions = 3600;
        let counter = initCounter;
        let state: SortKeyCacheResult<EvalStateResult<ExampleContractState>> | undefined;
        let contractCounter: number;
        while (counter < initCounter + numberOfInteractions) {
            try {
                const response = await contract.writeInteraction({ function: 'add' })
                console.log('interaction response', response);
                counter++;
            } catch(e) {
                console.error("interaction failed", e);
            }

            try {
                state = await contract.readState();
            } catch(e) {
                console.error("read state failed", e);
                state = undefined;
            }
            if (state) {
                contractCounter = state.cachedValue.state.counter
                console.log('counter from contract', contractCounter)
            }
            await sleep(1000);
        }
    } finally {
        await arlocal.stop();
    }
}

main().catch((e) => console.error(e));
