import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import fs from 'fs';
import path from 'path';
import { createServer, Server } from 'http';
import { DeployPlugin, ArweaveSigner } from 'warp-contracts-plugin-deploy';
import { Contract, WriteInteractionResponse } from '../../../contract/Contract';
import { Warp } from '../../../core/Warp';
import { WarpFactory, defaultCacheOptions, defaultWarpGwOptions } from '../../../core/WarpFactory';
import { SourceType } from '../../../core/modules/impl/WarpGatewayInteractionsLoader';
import { AddressInfo } from 'net';
import { WARP_TAGS } from '../../../core/KnownTags';

interface ExampleContractState {
    counter: number;
}

// FIXME: change to the address of the sequencer on dev
const DECENTRALIZED_SEQUENCER_URL = 'http://sequencer-0.warp.cc:1317';

describe('Testing sending of interactions to a decentralized sequencer', () => {
    let contractSrc: string;
    let initialState: string;
    let wallet: JWKInterface;
    let arlocal: ArLocal;
    let warp: Warp;
    let contract: Contract<ExampleContractState>;
    let sequencerServer: Server;
    let centralizedSeqeuencerUrl: string;
    let centralizedSequencerType: boolean;

    beforeAll(async () => {
        const port = 1813;
        arlocal = new ArLocal(port, false);
        await arlocal.start();

        const arweave = Arweave.init({
            host: 'localhost',
            port: port,
            protocol: 'http'
        });

        // a mock server simulating a centralized sequencer
        centralizedSequencerType = false;
        sequencerServer = createServer((req, res) => {
            if (req.url === '/gateway/sequencer/address') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    url: centralizedSequencerType ? centralizedSeqeuencerUrl : DECENTRALIZED_SEQUENCER_URL,
                    type: centralizedSequencerType ? 'centralized' : 'decentralized'
                }));
                return;
            } else if (req.url === '/gateway/v2/sequencer/register') {
                centralizedSequencerType = false;
                res.writeHead(301, { Location: DECENTRALIZED_SEQUENCER_URL });
                res.end();
                return;
            }
            throw new Error("Unexpected sequencer path: " + req.url);
        })
        await new Promise<void>(resolve => {
            sequencerServer.listen(() => {
                const address = sequencerServer.address() as AddressInfo
                centralizedSeqeuencerUrl = `http://localhost:${address.port}`
                resolve()
            })
        })

        const cacheOptions = {
            ...defaultCacheOptions,
            inMemory: true
        }
        const gatewayOptions = { ...defaultWarpGwOptions, source: SourceType.WARP_SEQUENCER, confirmationStatus: { notCorrupted: true } }

        warp = WarpFactory
            .custom(arweave, cacheOptions, 'custom')
            .useWarpGateway(gatewayOptions, cacheOptions)
            .build()
            .use(new DeployPlugin());

        ({ jwk: wallet } = await warp.generateWallet());

        contractSrc = fs.readFileSync(path.join(__dirname, '../data/example-contract.js'), 'utf8');
        initialState = fs.readFileSync(path.join(__dirname, '../data/example-contract-state.json'), 'utf8');

        const { contractTxId } = await warp.deploy({
            wallet: new ArweaveSigner(wallet),
            initState: initialState,
            src: contractSrc
        });

        contract = warp.contract<ExampleContractState>(contractTxId).setEvaluationOptions({
            sequencerUrl: centralizedSeqeuencerUrl
        });
        contract.connect(wallet);

    });

    afterAll(async () => {
        await arlocal.stop();
        await new Promise(resolve => {
            sequencerServer.close(resolve)
        })
    });

    const getNonceFromResult = (result: WriteInteractionResponse | null): number => {
        if (result) {
            for (let tag of result.interactionTx.tags) {
                if (tag.name === WARP_TAGS.SEQUENCER_NONCE) {
                    return Number(tag.value)
                }
            }    
        }
        return -1
    }

    it('should add new interactions waiting for confirmation from the sequencer', async () => {
        contract.setEvaluationOptions({ waitForConfirmation: true })

        await contract.writeInteraction({ function: 'add' });
        const result = await contract.writeInteraction({ function: 'add' });
        expect(getNonceFromResult(result)).toEqual(1)
        expect(result?.bundlrResponse).toBeUndefined();
        expect(result?.sequencerTxHash).toBeDefined();
    });

    it('should add new interactions without waiting for confirmation from the sequencer', async () => {
        contract.setEvaluationOptions({ waitForConfirmation: false })

        await contract.writeInteraction({ function: 'add' });
        const result = await contract.writeInteraction({ function: 'add' });
        expect(getNonceFromResult(result)).toEqual(3)
        expect(result?.bundlrResponse).toBeUndefined();
        expect(result?.sequencerTxHash).toBeUndefined();
    });

    it('should follow the redirection returned by the centralized sequencer.', async () => {
        centralizedSequencerType = true;
        contract.setEvaluationOptions({
            sequencerUrl: centralizedSeqeuencerUrl,
            waitForConfirmation: true
        });

        const result = await contract.writeInteraction({ function: 'add' });
        expect(getNonceFromResult(result)).toEqual(4)
        expect(result?.bundlrResponse).toBeUndefined();
        expect(result?.sequencerTxHash).toBeDefined();
    });
});
