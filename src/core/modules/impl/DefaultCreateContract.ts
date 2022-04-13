/* eslint-disable */
import { ContractData, ContractType, CreateContract, FromSrcTxContractData, SmartWeaveTags } from '@smartweave/core';
import Arweave from 'arweave';
import { LoggerFactory } from '@smartweave/logging';
import { Go } from './wasm/go-wasm-imports';
import metering from 'redstone-wasm-metering';
import fs, { PathOrFileDescriptor } from 'fs';
import { matchMutClosureDtor } from './wasm/wasm-bindgen-tools';
import { parseInt } from 'lodash';
import Transaction from 'arweave/node/lib/transaction';
import stringify from 'safe-stable-stringify';

const wasmTypeMapping: Map<number, string> = new Map([
  [1, 'assemblyscript'],
  [2, 'rust'],
  [3, 'go']
  /*[4, 'swift'],
  [5, 'c']*/
]);

export class DefaultCreateContract implements CreateContract {
  private readonly logger = LoggerFactory.INST.create('DefaultCreateContract');

  constructor(private readonly arweave: Arweave) {
    this.deployFromSourceTx = this.deployFromSourceTx.bind(this);
  }

  async deploy(contractData: ContractData, useBundler = false): Promise<string> {
    this.logger.debug('Creating new contract');

    const { wallet, src, initState, tags, transfer, wasmSrcCodeDir, wasmGlueCode } = contractData;
    const contractType: ContractType = src instanceof Buffer ? 'wasm' : 'js';
    let srcTx;
    let wasmLang = null;
    let wasmVersion = null;
    const metadata = {};

    const data: Buffer[] = [];

    if (contractType == 'wasm') {
      const meteredWasmBinary = metering.meterWASM(src, {
        meterType: 'i32'
      });
      data.push(meteredWasmBinary);

      const wasmModule = await WebAssembly.compile(src as Buffer);
      const moduleImports = WebAssembly.Module.imports(wasmModule);
      let lang;

      if (this.isGoModule(moduleImports)) {
        const go = new Go(null);
        const module = new WebAssembly.Instance(wasmModule, go.importObject);
        // DO NOT await here!
        go.run(module);
        lang = go.exports.lang();
        wasmVersion = go.exports.version();
      } else {
        const module: WebAssembly.Instance = await WebAssembly.instantiate(src, dummyImports(moduleImports));
        // @ts-ignore
        if (!module.instance.exports.lang) {
          throw new Error(`No info about source type in wasm binary. Did you forget to export "lang" function?`);
        }
        // @ts-ignore
        lang = module.instance.exports.lang();
        // @ts-ignore
        wasmVersion = module.instance.exports.version();
        if (!wasmTypeMapping.has(lang)) {
          throw new Error(`Unknown wasm source type ${lang}`);
        }
      }

      wasmLang = wasmTypeMapping.get(lang);
      if (wasmSrcCodeDir == null) {
        throw new Error('No path to original wasm contract source code');
      }

      const zippedSourceCode = await this.zipContents(wasmSrcCodeDir);
      data.push(zippedSourceCode);

      if (wasmLang == 'rust') {
        if (!wasmGlueCode) {
          throw new Error('No path to generated wasm-bindgen js code');
        }
        const wasmBindgenSrc = fs.readFileSync(wasmGlueCode, 'utf-8');
        const dtor = matchMutClosureDtor(wasmBindgenSrc);
        metadata['dtor'] = parseInt(dtor);
        data.push(Buffer.from(wasmBindgenSrc));
      }
    }

    const allData = contractType == 'wasm' ? this.joinBuffers(data) : src;

    srcTx = await this.arweave.createTransaction({ data: allData }, wallet);
    srcTx.addTag(SmartWeaveTags.APP_NAME, 'SmartWeaveContractSource');
    // TODO: version should be taken from the current package.json version.
    srcTx.addTag(SmartWeaveTags.APP_VERSION, '0.3.0');
    srcTx.addTag(SmartWeaveTags.SDK, 'RedStone');
    srcTx.addTag(SmartWeaveTags.CONTENT_TYPE, contractType == 'js' ? 'application/javascript' : 'application/wasm');

    if (contractType == 'wasm') {
      srcTx.addTag(SmartWeaveTags.WASM_LANG, wasmLang);
      srcTx.addTag(SmartWeaveTags.WASM_LANG_VERSION, wasmVersion);
      srcTx.addTag(SmartWeaveTags.WASM_META, JSON.stringify(metadata));
    }

    await this.arweave.transactions.sign(srcTx, wallet);
    this.logger.debug('Posting transaction with source');

    // note: in case of useBundler = true, we're posting both
    // src tx and contract tx in one request.
    let responseOk = true;
    if (!useBundler) {
      const response = await this.arweave.transactions.post(srcTx);
      responseOk = response.status === 200 || response.status === 208;
    }

    if (responseOk) {
      return await this.deployFromSourceTx(
        {
          srcTxId: srcTx.id,
          wallet,
          initState,
          tags,
          transfer
        },
        useBundler,
        srcTx
      );
    } else {
      throw new Error(`Unable to write Contract Source`);
    }
  }

  async deployFromSourceTx(
    contractData: FromSrcTxContractData,
    useBundler = false,
    srcTx: Transaction = null
  ): Promise<string> {
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

    await this.arweave.transactions.sign(contractTX, wallet);

    let responseOk;
    if (useBundler) {
      const result = await this.post(contractTX, srcTx);
      this.logger.debug(result);
      responseOk = true;
    } else {
      const response = await this.arweave.transactions.post(contractTX);
      responseOk = response.status === 200 || response.status === 208;
    }

    if (responseOk) {
      return contractTX.id;
    } else {
      throw new Error(`Unable to write Contract`);
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

    const response = await fetch(`https://gateway.redstone.finance/gateway/contracts/deploy`, {
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
      throw new Error(`Error while posting contract ${response.statusText}`);
    }
  }

  private isGoModule(moduleImports: WebAssembly.ModuleImportDescriptor[]) {
    return moduleImports.some((moduleImport) => {
      return moduleImport.module == 'env' && moduleImport.name.startsWith('syscall/js');
    });
  }

  private joinBuffers(buffers: Buffer[]): Buffer {
    const length = buffers.length;
    const result = [];
    result.push(Buffer.from(length.toString()));
    result.push(Buffer.from('|'));
    buffers.forEach((b) => {
      result.push(Buffer.from(b.length.toString()));
      result.push(Buffer.from('|'));
    });
    result.push(...buffers);
    return result.reduce((prev, b) => Buffer.concat([prev, b]));
  }

  private async zipContents(source: PathOrFileDescriptor): Promise<Buffer> {
    const archiver = require('archiver'),
      streamBuffers = require('stream-buffers');
    const outputStreamBuffer = new streamBuffers.WritableStreamBuffer({
      initialSize: 1000 * 1024, // start at 1000 kilobytes.
      incrementAmount: 1000 * 1024 // grow by 1000 kilobytes each time buffer overflows.
    });
    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level.
    });
    archive.on('error', function (err) {
      throw err;
    });
    archive.pipe(outputStreamBuffer);
    archive.directory(source.toString(), source.toString());
    await archive.finalize();
    outputStreamBuffer.end();

    return outputStreamBuffer.getContents();
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
