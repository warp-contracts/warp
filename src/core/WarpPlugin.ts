export const knownWarpPlugins = [
  'evm-signature-verification',
  'smartweave-nlp-extension',
  'smartweave-ethers-extension',
  'subscription',
  'ivm-handler-api',
  'evaluation-progress'
] as const;
export type WarpPluginType = typeof knownWarpPlugins[number];

export interface WarpPlugin<T, R> {
  type(): WarpPluginType;

  process(input: T): R;
}
