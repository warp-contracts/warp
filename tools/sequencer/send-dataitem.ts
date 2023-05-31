/* eslint-disable */
/**
 * This script send a data item to the sequencers
 */

import { createData, ArweaveSigner, EthereumSigner } from "arbundles";
import * as fs from 'fs';
import { exit } from "process";
const commandLineArgs = require('command-line-args')
const http = require('http');

const optionDefinitions = [
    { name: 'data', type: String, alias: 'd' },
    { name: 'tag', type: String, alias: 't', multiple: true },
    { name: 'arweave-wallet', type: String, alias: 'a' },
    { name: 'etherum-private-key', type: String, alias: 'e' },
    { name: 'address', type: String },
]

const createDataItem = (args: any) => {
    console.log(args)
    if (args["arweave-wallet"] === undefined && args["etherum-private-key"] === undefined ||
        args["arweave-wallet"] !== undefined && args["etherum-private-key"] !== undefined) {
        console.error("Exactly one of arweave-wallet or etherum-private-key must be provided")
        exit(1)
    }

    // Setup one of the signing methods
    let signer: any
    if (args["arweave-wallet"] !== "") {
        const wallet = fs.readFileSync(args['arweave-wallet']).toString()
        signer = new ArweaveSigner(JSON.parse(wallet));
    } else if (args["etherum-private-key"] !== "") {
        const privateKey = fs.readFileSync(args['etherum-private-key']).toString()
        signer = new EthereumSigner(privateKey)
    }

    // Parse tags
    let tags = Array<{
        name: string
        value: string
    }>()
    for (const t of args.tag) {
        const [name, value] = t.split('=')
        tags.push({ name, value })
    }

    return createData(fs.readFileSync(args.data), signer, { tags })
}

function send({ body, ...options }) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            method: 'POST',
            ...options,
        }, res => {
            const chunks = Array<any>();
            res.on('data', data => chunks.push(data))
            res.on('end', () => {
                let resBody = Buffer.concat(chunks);
                switch (res.headers['content-type']) {
                    case 'application/json':
                        resBody = JSON.parse(resBody.toString());
                        break;
                }
                resolve(resBody)
            })
        })
        req.on('error', reject);
        if (body) {
            req.write(body);
        }
        req.end();
    })
}
async function main() {
    const args = commandLineArgs(optionDefinitions)

    const dataItem = createDataItem(args)

    send({
        hostname: args.address,
        port: 1317,
        path: `/api/v1/dataitem`,
        body: dataItem.getRaw(),
    }).then((res: any) => {
        console.log("Response:", res.toString())
    })
}

main().catch((e) => console.error(e));
