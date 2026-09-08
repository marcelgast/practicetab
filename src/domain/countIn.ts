export const COUNT_IN_OPTIONS = [1, 2, 4, 6] as const;
export type CountInBars = (typeof COUNT_IN_OPTIONS)[number];

export const METRONOME_SYNC_TOOLTIP = 'Sync Metronome';
export const COUNT_IN_TOOLTIP = 'Set count in';
