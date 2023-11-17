import ArLocal from 'arlocal';
import Arweave from 'arweave';
import { JWKInterface } from 'arweave/node/lib/wallet';
import fs from 'fs';
import path from 'path';
import { createServer, request, Server } from 'http';
import { DeployPlugin, ArweaveSigner } from 'warp-contracts-plugin-deploy';
import { Contract, WriteInteractionResponse } from '../../../contract/Contract';
import { Warp } from '../../../core/Warp';
import { WarpFactory, defaultCacheOptions, defaultWarpGwOptions } from '../../../core/WarpFactory';
import { SourceType } from '../../../core/modules/impl/WarpGatewayInteractionsLoader';
import { AddressInfo } from 'net';
import { WARP_TAGS } from '../../../core/KnownTags';
import { LoggerFactory } from '../../../logging/LoggerFactory';

interface ExampleContractState {
    counter: number;
}

// FIXME: change to the address of the sequencer on dev
const DECENTRALIZED_SEQUENCER_URL = 'http://sequencer-0.warp.cc:1317';
const GW_URL = 'http://34.141.17.15:5666/';

describe('Testing sending of interactions to a decentralized sequencer', () => {
    let contractSrc: string;
    let initialState: string;
    let wallet: JWKInterface;
    let arlocal: ArLocal;
    let warp: Warp;
    let contract: Contract<ExampleContractState>;
    let mockGwServer: Server;
    let mockGwUrl: string;
    let centralizedSequencerType: boolean;
    let confirmAnyTx: boolean;

    /**
     * For testing purposes, operations returning the sequencer's address and registering/confirming interactions are mocked. 
     * Other requests are forwarded to the real Gateway.
     */
    const mockGw = async () => {
        mockGwServer = createServer((req, res) => {
            if (req.url === '/gateway/sequencer/address') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    url: centralizedSequencerType ? mockGwUrl : DECENTRALIZED_SEQUENCER_URL,
                    type: centralizedSequencerType ? 'centralized' : 'decentralized'
                }));
                return;
            } else if (req.url === '/gateway/v2/sequencer/register') {
                centralizedSequencerType = false;
                res.writeHead(301, { Location: DECENTRALIZED_SEQUENCER_URL });
                res.end();
                return;
            } else if (req.url?.startsWith('/gateway/interactions/')) {
                res.writeHead(confirmAnyTx ? 200 : 204);
                res.end();
                return;
            }

            var options = {
                hostname: new URL(GW_URL).hostname,
                port: new URL(GW_URL).port,
                path: req.url,
                method: req.method,
                headers: req.headers
            };

            var proxy = request(options, (gwRes) => {
                if (gwRes.statusCode) {
                    res.writeHead(gwRes.statusCode, gwRes.headers)
                    gwRes.pipe(res, {
                        end: true
                    });
                }
            });

            req.pipe(proxy, {
                end: true
            });
        });
        await new Promise<void>(resolve => {
            mockGwServer.listen(() => {
                const address = mockGwServer.address() as AddressInfo
                mockGwUrl = `http://localhost:${address.port}`
                resolve()
            })
        });
    }

    beforeAll(async () => {
        LoggerFactory.INST.logLevel('debug');
        const port = 1813;
        arlocal = new ArLocal(port, false);
        await arlocal.start();

        const arweave = Arweave.init({
            host: 'localhost',
            port: port,
            protocol: 'http'
        });

        centralizedSequencerType = false;
        confirmAnyTx = false;
        await mockGw();

        const cacheOptions = {
            ...defaultCacheOptions,
            inMemory: true
        }
        const gatewayOptions = { ...defaultWarpGwOptions, source: SourceType.WARP_SEQUENCER, confirmationStatus: { notCorrupted: true } }

        warp = WarpFactory
            .custom(arweave, cacheOptions, 'custom')
            .useWarpGateway(gatewayOptions, cacheOptions)
            .build()
            .useGwUrl(mockGwUrl)
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
            sequencerUrl: mockGwUrl
        });
        contract.connect(wallet);

    });

    afterAll(async () => {
        await arlocal.stop();
        await new Promise(resolve => {
            mockGwServer.close(resolve)
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

    it('should follow the redirection returned by the centralized sequencer.', async () => {
        confirmAnyTx = true;
        centralizedSequencerType = true;
        contract.setEvaluationOptions({
            waitForConfirmation: true
        });

        await contract.writeInteraction({ function: 'add' });
        const result = await contract.writeInteraction({ function: 'add' });
        expect(getNonceFromResult(result)).toEqual(1)
    });

    it('should add new interactions waiting for confirmation from the gateway', async () => {
        contract.setEvaluationOptions({ waitForConfirmation: true })
        setTimeout(() => confirmAnyTx = true, 2000);

        await contract.writeInteraction({ function: 'add' });
        const result = await contract.writeInteraction({ function: 'add' });
        expect(getNonceFromResult(result)).toEqual(3)
    });

    it('should add new interactions without waiting for confirmation from the gateway', async () => {
        contract.setEvaluationOptions({ waitForConfirmation: false })

        await contract.writeInteraction({ function: 'add' });
        const result = await contract.writeInteraction({ function: 'add' });
        expect(getNonceFromResult(result)).toEqual(5)
    });
});
