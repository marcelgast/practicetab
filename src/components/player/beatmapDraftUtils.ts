import type { BeatmapLoopEvent, BeatmapTimeEvent } from '../../domain/beatmap';

export type BeatmapTimeEventDraft = BeatmapTimeEvent & {
  _draftId: string;
  _isNew: boolean;
};

export type BeatmapLoopEventDraft = BeatmapLoopEvent & {
  _draftId: string;
  _isNew: boolean;
};

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function normalizeBeatUnit(value: number): 1 | 2 | 4 | 8 | 16 | 32 {
  const rounded = Math.round(value);
  const valid = [1, 2, 4, 8, 16, 32];
  return (valid.includes(rounded) ? rounded : 4) as 1 | 2 | 4 | 8 | 16 | 32;
}

export function canSaveNewTimeDraft(event: BeatmapTimeEventDraft): boolean {
  return (
    Number.isFinite(event.barIndex) &&
    Number.isFinite(event.bpm) &&
    Number.isFinite(event.timeSigTop) &&
    Number.isFinite(event.timeSigBottom)
  );
}

export function canSaveNewLoopDraft(event: BeatmapLoopEventDraft): boolean {
  return (
    Number.isFinite(event.startBar) &&
    Number.isFinite(event.endBar) &&
    Number.isFinite(event.repeatCount)
  );
}
