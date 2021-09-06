import { ContractData, CreateContract, FromSrcTxContractData, SmartWeaveTags } from '@smartweave/core';
import Arweave from 'arweave';
import { LoggerFactory } from '@smartweave/logging';

const logger = LoggerFactory.INST.create(__filename);

export class DefaultCreateContract implements CreateContract {
  constructor(private readonly arweave: Arweave) {
    this.deployFromSourceTx = this.deployFromSourceTx.bind(this);
  }

  async deploy(contractData: ContractData) {
    logger.debug('Creating new contract');

    const { wallet, src, initState, tags, transfer } = contractData;

    const srcTx = await this.arweave.createTransaction({ data: src }, wallet);

    srcTx.addTag(SmartWeaveTags.APP_NAME, 'SmartWeaveContractSource');
    // TODO: version should be taken from the current package.json version.
    srcTx.addTag(SmartWeaveTags.APP_VERSION, '0.3.0');
    srcTx.addTag('Content-Type', 'application/javascript');

    await this.arweave.transactions.sign(srcTx, wallet);

    logger.debug('Posting transaction with source');
    const response = await this.arweave.transactions.post(srcTx);

    if (response.status === 200 || response.status === 208) {
      return await this.deployFromSourceTx({
        srcTxId: srcTx.id,
        wallet,
        initState,
        tags,
        transfer
      });
    } else {
      throw new Error('Unable to write Contract Source.');
    }
  }

  async deployFromSourceTx(contractData: FromSrcTxContractData): Promise<string> {
    logger.debug('Creating new contract from src tx');

    const { wallet, srcTxId, initState, tags, transfer } = contractData;

    let contractTX = await this.arweave.createTransaction({ data: initState }, wallet);

    if (+transfer?.winstonQty > 0 && transfer.target.length) {
      logger.debug('Creating additional transaction with AR transfer', transfer);
      contractTX = await this.arweave.createTransaction(
        {
          data: initState,
          target: transfer.target,
          quantity: transfer.winstonQty
        },
        wallet
      );
    }

    if (tags?.length) {
      for (const tag of tags) {
        contractTX.addTag(tag.name.toString(), tag.value.toString());
      }
    }
    contractTX.addTag(SmartWeaveTags.APP_NAME, 'SmartWeaveContract');
    contractTX.addTag(SmartWeaveTags.APP_VERSION, '0.3.0');
    contractTX.addTag(SmartWeaveTags.CONTRACT_SRC_TX_ID, srcTxId);
    contractTX.addTag('Content-Type', 'application/json');

    await this.arweave.transactions.sign(contractTX, wallet);

    const response = await this.arweave.transactions.post(contractTX);
    if (response.status === 200 || response.status === 208) {
      return contractTX.id;
    } else {
      throw new Error('Unable to write Contract Initial State');
    }
  }

  update(contractTxId: string, contractData: ContractData): Promise<void> {
    throw new Error('Not implemented yet');
  }
}
