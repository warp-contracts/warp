/* eslint-disable */
/**
 * This script send a data item to the sequencers
 */

import { EthereumSigner } from "arbundles";
import { createData, ArweaveSigner, DataItem } from "warp-arbundles";
import * as fs from 'fs';
import { exit } from "process";
import { DecentralizedSequencer } from '../../src/contract/DecentralizedSequencer'
import { WARP_TAGS } from '../../src/core/KnownTags';

const commandLineArgs = require('command-line-args')
const http = require('http');

const optionDefinitions = [
    { name: 'data', type: String, alias: 'd' },
    { name: 'tag', type: String, alias: 't', multiple: true },
    { name: 'arweave-wallet', type: String, alias: 'a' },
    { name: 'etherum-private-key', type: String, alias: 'e' },
    { name: 'address', type: String },
]

const checkArgs = (args: any) => {
    console.log(args)
    if (args["arweave-wallet"] === undefined && args["etherum-private-key"] === undefined ||
        args["arweave-wallet"] !== undefined && args["etherum-private-key"] !== undefined) {
        console.error("Exactly one of arweave-wallet or etherum-private-key must be provided")
        exit(1)
    }
}

const createDataItem = async (decentralizedSequencer: DecentralizedSequencer, args: any): Promise<DataItem> => {
    // Setup one of the signing methods
    let signer: any
    let signatureType: number
    if (args["arweave-wallet"]) {
        const wallet = fs.readFileSync(args['arweave-wallet']).toString()
        signer = new ArweaveSigner(JSON.parse(wallet));
    } else if (args["etherum-private-key"]) {
        const privateKey = fs.readFileSync(args['etherum-private-key']).toString()
        signer = new EthereumSigner(privateKey)
    }

    // Parse tags
    let tags: Array<{
        name: string
        value: string
    }> = []
    if (args.tag) {
        for (const t of args.tag) {
            const [name, value] = t.split('=')
            tags.push({ name, value })
        }
    }
    const nonce = await decentralizedSequencer.fetchNonce(signer)
    tags.push({ name: WARP_TAGS.SEQUENCER_NONCE, value: String(nonce) })

    let dataItem = createData(fs.readFileSync(args.data), signer, { tags })
    await dataItem.sign(signer)
    return dataItem
}

async function main() {
    const args = commandLineArgs(optionDefinitions)
    checkArgs(args)

    const decentralizedSequencer = new DecentralizedSequencer(`http://${args.address}:1317`)
    const dataItem = await createDataItem(decentralizedSequencer, args)
    await decentralizedSequencer.sendDataItem(dataItem, true)
}

main().catch((e) => console.error(e));
