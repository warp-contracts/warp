export const knownWarpPluginsPartial = [`^smartweave-extension-`] as const;
export const knownWarpPlugins = [
  'evm-signature-verification',
  'subscription',
  'ivm-handler-api',
  'evaluation-progress',
  'fetch-options'
] as const;
type WarpPluginPartialType = `smartweave-extension-${string}`;
export type WarpKnownPluginType = (typeof knownWarpPlugins)[number];
export type WarpPluginType = WarpKnownPluginType | WarpPluginPartialType;

export interface WarpPlugin<T, R> {
  type(): WarpPluginType;

  process(input: T): R;
}
