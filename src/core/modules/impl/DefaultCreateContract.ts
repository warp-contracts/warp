/* eslint-disable */
import { ContractData, ContractType, CreateContract, FromSrcTxContractData, SmartWeaveTags } from '@smartweave/core';
import Arweave from 'arweave';
import { LoggerFactory } from '@smartweave/logging';
import { asWasmImports } from './wasm/as-wasm-imports';
import { rustWasmImports } from './wasm/rust-wasm-imports';

const wasmTypeMapping: Map<number, string> = new Map([
  [1, 'assemblyscript'],
  [2, 'rust'],
  [3, 'go'],
  [4, 'swift'],
  [5, 'c']
]);

export class DefaultCreateContract implements CreateContract {
  private readonly logger = LoggerFactory.INST.create('DefaultCreateContract');

  constructor(private readonly arweave: Arweave) {
    this.deployFromSourceTx = this.deployFromSourceTx.bind(this);
  }

  async deploy(contractData: ContractData): Promise<string> {
    this.logger.debug('Creating new contract');

    const { wallet, src, initState, tags, transfer } = contractData;

    const srcTx = await this.arweave.createTransaction({ data: src }, wallet);

    const contractType: ContractType = src instanceof Buffer ? 'wasm' : 'js';

    srcTx.addTag(SmartWeaveTags.APP_NAME, 'SmartWeaveContractSource');
    // TODO: version should be taken from the current package.json version.
    srcTx.addTag(SmartWeaveTags.APP_VERSION, '0.3.0');
    srcTx.addTag(SmartWeaveTags.SDK, 'RedStone');
    srcTx.addTag(SmartWeaveTags.CONTENT_TYPE, contractType == 'js' ? 'application/javascript' : 'application/wasm');

    let wasmLang = null;

    if (contractType == 'wasm') {
      const wasmModule = await WebAssembly.compile(src as Buffer);
      const moduleImports = WebAssembly.Module.imports(wasmModule);
      const module = await WebAssembly.instantiate(src, dummyImports(moduleImports));
      // @ts-ignore
      if (!module.instance.exports.type) {
        throw new Error(`No info about source type in wasm binary. Did you forget to export "type" function?`);
      }
      // @ts-ignore
      const type = module.instance.exports.type();
      if (!wasmTypeMapping.has(type)) {
        throw new Error(`Unknown wasm source type ${type}`);
      }

      wasmLang = wasmTypeMapping.get(type);

      srcTx.addTag(SmartWeaveTags.WASM_LANG, wasmLang);
    }

    await this.arweave.transactions.sign(srcTx, wallet);

    this.logger.debug('Posting transaction with source');
    const response = await this.arweave.transactions.post(srcTx);

    if (response.status === 200 || response.status === 208) {
      return await this.deployFromSourceTx({
        srcTxId: srcTx.id,
        wallet,
        initState,
        contractType,
        wasmLang,
        tags,
        transfer
      });
    } else {
      throw new Error('Unable to write Contract Source.');
    }
  }

  async deployFromSourceTx(contractData: FromSrcTxContractData): Promise<string> {
    this.logger.debug('Creating new contract from src tx');

    const { wallet, srcTxId, initState, tags, transfer } = contractData;

    let contractTX = await this.arweave.createTransaction({ data: initState }, wallet);

    if (+transfer?.winstonQty > 0 && transfer.target.length) {
      this.logger.debug('Creating additional transaction with AR transfer', transfer);
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
    contractTX.addTag(SmartWeaveTags.SDK, 'RedStone');
    contractTX.addTag(SmartWeaveTags.CONTENT_TYPE, 'application/json');
    contractTX.addTag(SmartWeaveTags.CONTRACT_TYPE, contractData.contractType);
    if (contractData.contractType == 'wasm') {
      contractTX.addTag(SmartWeaveTags.WASM_LANG, contractData.wasmLang);
    }

    await this.arweave.transactions.sign(contractTX, wallet);

    const response = await this.arweave.transactions.post(contractTX);
    if (response.status === 200 || response.status === 208) {
      return contractTX.id;
    } else {
      throw new Error('Unable to write Contract Initial State');
    }
  }
}

function dummyImports(moduleImports: WebAssembly.ModuleImportDescriptor[]) {
  const imports = {};

  moduleImports.forEach((moduleImport) => {
    if (!Object.prototype.hasOwnProperty.call(imports, moduleImport.module)) {
      imports[moduleImport.module] = {};
    }
    imports[moduleImport.module][moduleImport.name] = function () {};
  });

  return imports;
}
