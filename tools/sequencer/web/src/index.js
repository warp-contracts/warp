import { ethers } from "ethers";
import { InjectedEthereumSigner } from 'warp-contracts-plugin-signature';
import base64url from 'base64url';
import { Buffer } from 'buffer';
import { createData, Signer } from "warp-arbundles";

window.Buffer = Buffer;

const getNonce = async (signer) => {
    const signatureType = signer.signatureType
    const owner = base64url.encode(signer.publicKey)
    const url = `http://localhost:1317/api/v1/nonce`
    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({signature_type: signatureType, owner})
    })
        .then(async res => {
            if (!res.ok) {
                throw new Error(await res.text())
            }
            return await res.json()})
        .then(data => data.nonce)
}

const createDataItem = async () => {
    // Setup one of the signing methods
    const signer = await getSigner()
    const nonce = await getNonce(signer)

    console.log('nonce', nonce)

    // Parse tags
    let tags = []
    tags.push({name: 'Sequencer-Nonce', value: String(nonce)})

    let dataItem = createData("data", signer, { tags })
    await dataItem.sign(signer)
    return dataItem
}

function send(dataItem) {
    const url = `http://localhost:1317/api/v1/dataitem`
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
    const dataItem = await createDataItem()
    console.log(dataItem.tags)
    console.log(dataItem.toJSON())
    send(dataItem)
}
main()

async function getSigner() {
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    provider.getSigner = () => signer;
    const userSigner = new InjectedEthereumSigner(provider);
    await userSigner.setPublicKey();
    return userSigner
}
