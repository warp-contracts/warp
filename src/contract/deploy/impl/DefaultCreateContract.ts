/* eslint-disable */
import Arweave from 'arweave';
import { WarpFetchWrapper } from '../../../core/WarpFetchWrapper';
import { Signature, CustomSignature } from '../../../contract/Signature';
import { SmartWeaveTags } from '../../../core/SmartWeaveTags';
import { Warp } from '../../../core/Warp';
import { WARP_GW_URL } from '../../../core/WarpFactory';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import {
  CreateContract,
  ContractData,
  ContractDeploy,
  FromSrcTxContractData,
  ArWallet,
  BundlrNodeType,
  BUNDLR_NODES
} from '../CreateContract';
import { SourceData, SourceImpl } from './SourceImpl';
import { Buffer } from 'warp-isomorphic';
import { Transaction } from '../../../utils/types/arweave-types';

export class DefaultCreateContract implements CreateContract {
  private readonly logger = LoggerFactory.INST.create('DefaultCreateContract');
  private readonly source: SourceImpl;

  private signature: Signature;
  private readonly warpFetchWrapper: WarpFetchWrapper;

  constructor(private readonly arweave: Arweave, private warp: Warp) {
    this.deployFromSourceTx = this.deployFromSourceTx.bind(this);
    this.source = new SourceImpl(this.warp);
    this.warpFetchWrapper = new WarpFetchWrapper(this.warp);
  }

  async deploy(contractData: ContractData, disableBundling?: boolean): Promise<ContractDeploy> {
    const { wallet, initState, tags, transfer, data, evaluationManifest } = contractData;

    const effectiveUseBundler =
      disableBundling == undefined ? this.warp.definitionLoader.type() == 'warp' : !disableBundling;

    const srcTx = await this.source.createSourceTx(contractData, wallet);
    if (!effectiveUseBundler) {
      await this.source.saveSourceTx(srcTx, true);
    }

    this.logger.debug('Creating new contract');

    return await this.deployFromSourceTx(
      {
        srcTxId: srcTx.id,
        wallet,
        initState,
        tags,
        transfer,
        data,
        evaluationManifest
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
    const { wallet, srcTxId, initState, tags, transfer, data, evaluationManifest } = contractData;
    this.signature = new Signature(this.warp, wallet);
    const signer = this.signature.signer;

    const effectiveUseBundler =
      disableBundling == undefined ? this.warp.definitionLoader.type() == 'warp' : !disableBundling;

    this.signature.checkNonArweaveSigningAvailability(effectiveUseBundler);

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

    if (contractData.evaluationManifest) {
      contractTX.addTag(SmartWeaveTags.MANIFEST, JSON.stringify(contractData.evaluationManifest));
    }

    await signer(contractTX);

    let responseOk: boolean;
    let response: { status: number; statusText: string; data: any };
    if (effectiveUseBundler) {
      const result = await this.postContract(contractTX, srcTx);
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

  async deployBundled(rawDataItem: Buffer): Promise<ContractDeploy> {
    const response = await fetch(`${WARP_GW_URL}/gateway/contracts/deploy-bundled`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        Accept: 'application/json'
      },
      body: rawDataItem
    });
    if (response.ok) {
      return response.json();
    } else {
      if (typeof response.json === 'function') {
        response
          .json()
          .then((responseError) => {
            if (responseError.message) {
              this.logger.error(responseError.message);
            }
          })
          .catch((err) => {
            this.logger.error(err);
          });
      }
      throw new Error(
        `Error while deploying data item. Warp Gateway responded with status ${response.status} ${response.statusText}`
      );
    }
  }

  async register(id: string, bundlrNode: BundlrNodeType): Promise<ContractDeploy> {
    const response = await fetch(`${WARP_GW_URL}/gateway/contracts/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ id, bundlrNode })
    });
    if (response.ok) {
      return response.json();
    } else {
      if (typeof response.json === 'function') {
        response
          .json()
          .then((responseError) => {
            if (responseError.message) {
              this.logger.error(responseError.message);
            }
          })
          .catch((err) => {
            this.logger.error(err);
          });
      }
      throw new Error(
        `Error while registering data item. Warp Gateway responded with status ${response.status} ${response.statusText}`
      );
    }
  }

  async createSourceTx(sourceData: SourceData, wallet: ArWallet | CustomSignature): Promise<Transaction> {
    return this.source.createSourceTx(sourceData, wallet);
  }

  async saveSourceTx(srcTx: Transaction, disableBundling?: boolean): Promise<string> {
    return this.source.saveSourceTx(srcTx, disableBundling);
  }

  private async postContract(contractTx: Transaction, srcTx: Transaction = null): Promise<any> {
    let body: any = {
      contractTx
    };
    if (srcTx) {
      body = {
        ...body,
        srcTx
      };
    }

    const response = await this.warpFetchWrapper.fetch(`${WARP_GW_URL}/gateway/contracts/deploy`, {
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

  isBundlrNodeType(value: string): value is BundlrNodeType {
    return BUNDLR_NODES.includes(value as BundlrNodeType);
  }
}
