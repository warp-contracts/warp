/* eslint-disable */
/**
 * This script send a data item to the sequencers
 */

import { createData, ArweaveSigner, DataItem, EthereumSigner, Signer } from "arbundles";
import * as fs from 'fs';
import { exit } from "process";
import base64url from 'base64url';
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

const getNonce = async (signer: Signer, args: any): Promise<number> => {
    const signatureType = signer.signatureType
    const owner = base64url.encode(signer.publicKey)
    const url = `http://${args.address}:1317/api/v1/nonce`
    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ signature_type: signatureType, owner })
    }).then(async res => {
        if (!res.ok) {
            throw new Error(await res.text())
        }
        return await res.json()
    }).then(data => data.nonce)
}

const createDataItem = async (args: any) => {
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
    const nonce = await getNonce(signer, args)

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
    tags.push({ name: 'Sequencer-Nonce', value: String(nonce) })

    let dataItem = createData(fs.readFileSync(args.data), signer, { tags })
    await dataItem.sign(signer)
    return dataItem
}

function send(args: any, dataItem: DataItem) {
    const url = `http://${args.address}:1317/api/v1/dataitem`
    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/octet-stream',
        },
        body: dataItem.getRaw()
    }).then(async res => {
        if (!res.ok) {
            throw new Error(await res.text())
        }
        console.log("Response:", await res.text())
    });
}

async function main() {
    const args = commandLineArgs(optionDefinitions)

    checkArgs(args)

    const dataItem = await createDataItem(args)

    send(args, dataItem)
}

main().catch((e) => console.error(e));
