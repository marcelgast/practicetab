/**
 * Tauri command wrappers for the Live-Feedback stats persistence.
 *
 * Mirrors `src-tauri/src/persistence/feedback_commands.rs`. All
 * functions are safe no-ops outside the Tauri runtime so the tests
 * and the non-Tauri dev server don't crash when the commands aren't
 * registered.
 */
import { invoke } from '@tauri-apps/api/core';
import type { StrictnessPreset } from '../domain/noteComparison';

/**
 * Compact per-note record stored in `details_json`. Single-letter
 * keys are deliberate — a 2000-note run at full NoteResult shape
 * would be megabytes; this keeps a typical run well under 300 KB.
 */
export interface FeedbackRunNoteDetail {
  /** startMs (note onset in ms, 1× speed — matches ExpectedNote.startMs divided by tempoFactor) */
  t: number;
  /** noteName in scientific notation ("E4", "A#3") */
  n: string;
  o: 'hit' | 'missed' | 'extra';
  pa: 'perfect' | 'good' | 'acceptable' | 'wrong' | null;
  co: number | null;
  ta: 'perfect' | 'good' | 'acceptable' | 'wrong' | null;
  to: number | null;
}

export interface RecordFeedbackRunInput {
  sessionId?: string | null;
  exerciseId?: string | null;
  libraryItemId: string;
  endedAt?: string | null;
  durationSeconds: number;
  strictnessPreset: StrictnessPreset;
  totalNotes: number;
  hitCount: number;
  missedCount: number;
  extraCount: number;
  pitchPerfect: number;
  pitchGood: number;
  pitchAcceptable: number;
  pitchWrong: number;
  timingPerfect: number;
  timingGood: number;
  timingAcceptable: number;
  timingWrong: number;
  longestStreak: number;
  overallScore: number;
  suggestSlowDown: boolean;
  suggestStringMuting: boolean;
  /** Pre-serialized JSON array of FeedbackRunNoteDetail records. */
  detailsJson: string;
}

export interface FeedbackRunOverview {
  id: number;
  sessionId: string | null;
  exerciseId: string | null;
  libraryItemId: string;
  endedAt: string;
  durationSeconds: number;
  strictnessPreset: StrictnessPreset;
  totalNotes: number;
  hitCount: number;
  missedCount: number;
  extraCount: number;
  pitchPerfect: number;
  pitchGood: number;
  pitchAcceptable: number;
  pitchWrong: number;
  timingPerfect: number;
  timingGood: number;
  timingAcceptable: number;
  timingWrong: number;
  longestStreak: number;
  overallScore: number;
  suggestSlowDown: boolean;
  suggestStringMuting: boolean;
}

export interface FeedbackRunDetails extends FeedbackRunOverview {
  detailsJson: string;
}

function isTauriRuntime(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
    ((window as unknown as { __TAURI__?: unknown }).__TAURI__ ||
      (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__),
  );
}

export async function recordFeedbackRun(
  input: RecordFeedbackRunInput,
): Promise<number | null> {
  if (!isTauriRuntime()) return null;
  return invoke<number>('record_feedback_run', { input });
}

export async function listFeedbackRuns(
  limit?: number,
): Promise<FeedbackRunOverview[]> {
  if (!isTauriRuntime()) return [];
  return invoke<FeedbackRunOverview[]>('list_feedback_runs', {
    limit: limit ?? null,
  });
}

export async function listFeedbackRunsForExercise(
  exerciseId: string,
  limit?: number,
): Promise<FeedbackRunOverview[]> {
  if (!isTauriRuntime()) return [];
  return invoke<FeedbackRunOverview[]>('list_feedback_runs_for_exercise', {
    exerciseId,
    limit: limit ?? null,
  });
}

export async function listFeedbackRunsForLibraryItem(
  libraryItemId: string,
  limit?: number,
): Promise<FeedbackRunOverview[]> {
  if (!isTauriRuntime()) return [];
  return invoke<FeedbackRunOverview[]>('list_feedback_runs_for_library_item', {
    libraryItemId,
    limit: limit ?? null,
  });
}

export async function getFeedbackRunDetails(
  id: number,
): Promise<FeedbackRunDetails | null> {
  if (!isTauriRuntime()) return null;
  const result = await invoke<FeedbackRunDetails | null>(
    'get_feedback_run_details',
    { id },
  );
  return result ?? null;
}

export async function deleteFeedbackRun(id: number): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  return invoke<boolean>('delete_feedback_run', { id });
}

/**
 * Backup-only: every feedback run with its `details_json` blob,
 * ordered chronologically. Heavy — the whole table including per-
 * note arrays — so the UI never calls this; only the export path
 * does. Returns `[]` outside the Tauri runtime (unit tests, Vite).
 */
export async function listFeedbackRunsWithDetails(): Promise<
  FeedbackRunDetails[]
> {
  if (!isTauriRuntime()) return [];
  return invoke<FeedbackRunDetails[]>('list_feedback_runs_with_details');
}
