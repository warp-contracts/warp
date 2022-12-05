export const knownWarpPlugins = [
  'evm-signature-verification',
  'smartweave-extension-nlp',
  'smartweave-extension-ethers',
  'subscription',
  'ivm-handler-api',
  'evaluation-progress'
] as const;
export type WarpPluginType = typeof knownWarpPlugins[number];

export interface WarpPlugin<T, R> {
  type(): WarpPluginType;

  process(input: T): R;
}

export type EvaluationProgressInput = {
  contractTxId: string;
  currentInteraction: number;
  allInteractions: number;
  lastInteractionProcessingTime: string;
}
