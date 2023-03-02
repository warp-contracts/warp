/* eslint-disable */
export declare abstract class BundlerSigner {
  readonly publicKey: Buffer;
  readonly signatureType: number;
  readonly signatureLength: number;
  readonly ownerLength: number;
  readonly pem?: string | Buffer;
  abstract sign(message: Uint8Array): Promise<Uint8Array> | Uint8Array;
  static verify(_: string | Buffer): boolean;
}

type ResolvesTo<T> = T | Promise<T> | ((...args: any[]) => Promise<T>);

export abstract class DataItem {
  readonly id: string;
  readonly signatureType: ResolvesTo<number>;
  readonly rawSignature: ResolvesTo<Buffer>;
  readonly signature: ResolvesTo<string>;
  readonly signatureLength: ResolvesTo<number>;
  readonly rawOwner: ResolvesTo<Buffer>;
  readonly owner: ResolvesTo<string>;
  readonly ownerLength: ResolvesTo<number>;
  readonly rawTarget: ResolvesTo<Buffer>;
  readonly target: ResolvesTo<string>;
  readonly rawAnchor: ResolvesTo<Buffer>;
  readonly anchor: ResolvesTo<string>;
  readonly rawTags: ResolvesTo<Buffer>;
  readonly tags: ResolvesTo<{ name: string; value: string }[]>;
  readonly rawData: ResolvesTo<Buffer>;
  readonly data: ResolvesTo<string>;
  abstract sign(signer: BundlerSigner): Promise<Buffer>;
  abstract isValid(): Promise<boolean>;
  static async verify(..._: any[]): Promise<boolean> {
    throw new Error('You must implement `verify`');
  }
  abstract getRaw(): Buffer;
}
