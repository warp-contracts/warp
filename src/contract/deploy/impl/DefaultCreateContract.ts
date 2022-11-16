/* eslint-disable */
import Arweave from 'arweave';
import Transaction from 'arweave/node/lib/transaction';
import { Wallet } from '../../../contract/Wallet';
import { SmartWeaveTags } from '../../../core/SmartWeaveTags';
import { Warp } from '../../../core/Warp';
import { WARP_GW_URL } from '../../../core/WarpFactory';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { CreateContract, ContractData, ContractDeploy, FromSrcTxContractData, ArWallet } from '../CreateContract';
import { SourceImpl } from './SourceImpl';

export class DefaultCreateContract implements CreateContract {
  private readonly logger = LoggerFactory.INST.create('DefaultCreateContract');
  private readonly wallet: Wallet;

  constructor(private readonly arweave: Arweave, private warp: Warp) {
    this.deployFromSourceTx = this.deployFromSourceTx.bind(this);
    this.wallet = new Wallet(this.warp);
  }

  async deploy(contractData: ContractData, disableBundling?: boolean): Promise<ContractDeploy> {
    const { wallet, initState, tags, transfer, data } = contractData;

    const effectiveUseBundler =
      disableBundling == undefined ? this.warp.definitionLoader.type() == 'warp' : !disableBundling;

    const source = new SourceImpl(this.warp);

    const srcTx = await source.save(contractData, this.warp.environment, wallet, effectiveUseBundler);
    this.logger.debug('Creating new contract');

    return await this.deployFromSourceTx(
      {
        srcTxId: srcTx.id,
        wallet,
        initState,
        tags,
        transfer,
        data
      },
      !effectiveUseBundler,
      srcTx
    );
  }

  async deployFromSourceTx(
    contractData: FromSrcTxContractData,
    disableBundling?: boolean,
    srcTx: Transaction = null
  ): Promise<ContractDeploy> {
    this.logger.debug('Creating new contract from src tx');
    const { wallet, srcTxId, initState, tags, transfer, data } = contractData;
    this.wallet.getSignature(wallet);
    const signer = this.wallet.signature.signer;

    const effectiveUseBundler =
      disableBundling == undefined ? this.warp.definitionLoader.type() == 'warp' : !disableBundling;

    if (this.wallet.signature.signatureType !== 'arweave' && !effectiveUseBundler) {
      throw new Error(
        `Unable to use signing function of type: ${this.wallet.signature.signatureType} when bundling is disabled.`
      );
    }

    let contractTX = await this.arweave.createTransaction({ data: data?.body || initState });

    if (+transfer?.winstonQty > 0 && transfer.target.length) {
      this.logger.debug('Creating additional transaction with AR transfer', transfer);
      contractTX = await this.arweave.createTransaction({
        data: data?.body || initState,
        target: transfer.target,
        quantity: transfer.winstonQty
      });
    }

    if (tags?.length) {
      for (const tag of tags) {
        contractTX.addTag(tag.name.toString(), tag.value.toString());
      }
    }
    contractTX.addTag(SmartWeaveTags.APP_NAME, 'SmartWeaveContract');
    contractTX.addTag(SmartWeaveTags.APP_VERSION, '0.3.0');
    contractTX.addTag(SmartWeaveTags.CONTRACT_SRC_TX_ID, srcTxId);
    contractTX.addTag(SmartWeaveTags.SDK, 'RedStone');
    if (data) {
      contractTX.addTag(SmartWeaveTags.CONTENT_TYPE, data['Content-Type']);
      contractTX.addTag(SmartWeaveTags.INIT_STATE, initState);
    } else {
      contractTX.addTag(SmartWeaveTags.CONTENT_TYPE, 'application/json');
    }

    if (this.warp.environment === 'testnet') {
      contractTX.addTag(SmartWeaveTags.WARP_TESTNET, '1.0.0');
    }

    await signer(contractTX);

    let responseOk: boolean;
    let response: { status: number; statusText: string; data: any };
    if (effectiveUseBundler) {
      const result = await this.post(contractTX, srcTx);
      this.logger.debug(result);
      responseOk = true;
    } else {
      response = await this.arweave.transactions.post(contractTX);
      responseOk = response.status === 200 || response.status === 208;
    }

    if (responseOk) {
      return { contractTxId: contractTX.id, srcTxId };
    } else {
      throw new Error(
        `Unable to write Contract. Arweave responded with status ${response.status}: ${response.statusText}`
      );
    }
  }

  private async post(contractTx: Transaction, srcTx: Transaction = null): Promise<any> {
    let body: any = {
      contractTx
    };
    if (srcTx) {
      body = {
        ...body,
        srcTx
      };
    }

    const response = await fetch(`${WARP_GW_URL}/gateway/contracts/deploy`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'Accept-Encoding': 'gzip, deflate, br',
        'Content-Type': 'application/json',
        Accept: 'application/json'
      }
    });

    if (response.ok) {
      return response.json();
    } else {
      throw new Error(
        `Error while posting contract. Sequencer responded with status ${response.status} ${response.statusText}`
      );
    }
  }
}
