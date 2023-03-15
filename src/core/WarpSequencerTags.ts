export const WARP_SEQUENCER_TAGS = {
  Sequencer: 'Sequencer',
  SequencerOwner: 'Sequencer-Owner',
  SequencerMills: 'Sequencer-Mills',
  SequencerSortKey: 'Sequencer-Sort-Key',
  SequencerLastSortKey: 'Sequencer-Last-Sort-Key',
  SequencerTxId: 'Sequencer-Tx-Id',
  SequencerBlockHeight: 'Sequencer-Block-Height',
  SequencerBlockId: 'Sequencer-Block-Id',
  SequencerBlockTimestamp: 'Sequencer-Block-Timestamp'
} as const;

type ObjectValues<T> = T[keyof T];
export type WarpSequencerTags = ObjectValues<typeof WARP_SEQUENCER_TAGS>;
