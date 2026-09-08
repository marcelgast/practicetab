export type {
  PracticePlanPayload,
  ActiveSessionPayload,
  SessionDetailPayload,
  IntervalModeSessionPayload,
  LibraryItemStatsPayload,
  RestorePracticeStatsInput,
  PracticePersistence,
} from './practicePersistenceTypes';

import type { PracticePersistence } from './practicePersistenceTypes';
import { browserAdapter } from './practicePersistenceBrowser';
import { tauriAdapter } from './practicePersistenceTauri';

function isTauriRuntime(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
    ((window as unknown as { __TAURI__?: unknown }).__TAURI__ ||
      (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__),
  );
}

export const practicePersistence: PracticePersistence = isTauriRuntime()
  ? tauriAdapter
  : browserAdapter;
