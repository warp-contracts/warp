/* eslint-disable */
import metering from 'redstone-wasm-metering';
import { Go } from '../../../core/modules/impl/wasm/go-wasm-imports';
import fs, { PathOrFileDescriptor } from 'fs';
import { matchMutClosureDtor } from '../../../core/modules/impl/wasm/wasm-bindgen-tools';
import { ArWallet, ContractType } from '../CreateContract';
import { SmartWeaveTags } from '../../../core/SmartWeaveTags';
import { LoggerFactory } from '../../../logging/LoggerFactory';
import { Source } from '../Source';
import { Buffer } from 'redstone-isomorphic';
import { Warp } from '../../../core/Warp';
import { Signature, CustomSignature } from '../../../contract/Signature';
import Transaction from 'arweave/node/lib/transaction';
import { WARP_GW_URL } from '../../../core/WarpFactory';
import { TagsParser } from '../../../core/modules/impl/TagsParser';

const wasmTypeMapping: Map<number, string> = new Map([
  [1, 'assemblyscript'],
  [2, 'rust'],
  [3, 'go']
  /*[4, 'swift'],
  [5, 'c']*/
]);

export interface SourceData {
  src: string | Buffer;
  wasmSrcCodeDir?: string;
  wasmGlueCode?: string;
}

export class SourceImpl implements Source {
  private readonly logger = LoggerFactory.INST.create('Source');
  private signature: Signature;

  constructor(private readonly warp: Warp) {}

  async createSourceTx(sourceData: SourceData, wallet: ArWallet | CustomSignature): Promise<Transaction> {
    this.logger.debug('Creating new contract source');

    const { src, wasmSrcCodeDir, wasmGlueCode } = sourceData;

    this.signature = new Signature(this.warp, wallet);
    const signer = this.signature.signer;

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
      let lang: number;

      if (this.isGoModule(moduleImports)) {
        const go = new Go(null);
        const module = new WebAssembly.Instance(wasmModule, go.importObject);
        // DO NOT await here!
        go.run(module);
        lang = go.exports.lang();
        wasmVersion = go.exports.version();
      } else {
        // @ts-ignore
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

    srcTx = await this.warp.arweave.createTransaction({ data: allData });

    srcTx.addTag(SmartWeaveTags.APP_NAME, 'SmartWeaveContractSource');
    // TODO: version should be taken from the current package.json version.
    srcTx.addTag(SmartWeaveTags.APP_VERSION, '0.3.0');
    srcTx.addTag(SmartWeaveTags.SDK, 'Warp');
    srcTx.addTag(SmartWeaveTags.CONTENT_TYPE, contractType == 'js' ? 'application/javascript' : 'application/wasm');

    if (contractType == 'wasm') {
      srcTx.addTag(SmartWeaveTags.WASM_LANG, wasmLang);
      srcTx.addTag(SmartWeaveTags.WASM_LANG_VERSION, wasmVersion);
      srcTx.addTag(SmartWeaveTags.WASM_META, JSON.stringify(metadata));
    }

    if (this.warp.environment === 'testnet') {
      srcTx.addTag(SmartWeaveTags.WARP_TESTNET, '1.0.0');
    }

    await signer(srcTx);

    this.logger.debug('Posting transaction with source');

    return srcTx;
  }

  async saveSourceTx(srcTx: Transaction, disableBundling: boolean = false): Promise<string> {
    this.logger.debug('Saving contract source', srcTx.id);

    if (this.warp.environment == 'local') {
      disableBundling = true;
    }

    const effectiveUseBundler =
      disableBundling == undefined ? this.warp.definitionLoader.type() == 'warp' : !disableBundling;

    const tagsParser = new TagsParser();
    const signatureTag = tagsParser.getTag(srcTx, SmartWeaveTags.SIGNATURE_TYPE);

    if (signatureTag && signatureTag != 'arweave' && !effectiveUseBundler) {
      throw new Error(`Unable to save source with signature type: ${signatureTag} when bundling is disabled.`);
    }

    let responseOk: boolean;
    let response: { status: number; statusText: string; data: any };

    if (!disableBundling) {
      const result = await this.postSource(srcTx);
      this.logger.debug(result);
      responseOk = true;
    } else {
      response = await this.warp.arweave.transactions.post(srcTx);
      responseOk = response.status === 200 || response.status === 208;
    }

    if (responseOk) {
      return srcTx.id;
    } else {
      throw new Error(
        `Unable to write Contract Source. Arweave responded with status ${response.status}: ${response.statusText}`
      );
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
    archive.on('error', function (err: any) {
      throw err;
    });
    archive.pipe(outputStreamBuffer);
    archive.directory(source.toString(), source.toString());
    await archive.finalize();
    outputStreamBuffer.end();

    return outputStreamBuffer.getContents();
  }

  private async postSource(srcTx: Transaction = null): Promise<any> {
    const response = await fetch(`${WARP_GW_URL}/gateway/sources/deploy`, {
      method: 'POST',
      body: JSON.stringify({ srcTx }),
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
        `Error while posting contract source. Sequencer responded with status ${response.status} ${response.statusText}`
      );
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
