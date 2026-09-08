import type { Ref } from 'vue';
import type { useMetronomeStore } from '../../stores/metronome';

export function parseTimeInput(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d{1,2}:\d{1,2}$/.test(trimmed)) {
    return null;
  }
  const [minutesPart, secondsPart] = trimmed.split(':');
  const minutes = Number(minutesPart);
  const seconds = Number(secondsPart);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return null;
  }
  if (seconds < 0 || seconds > 59) {
    return null;
  }
  return Math.max(0, minutes * 60 + seconds);
}

export function sanitizeTimeDraft(value: string): string {
  const filtered = value.replace(/[^\d:]/g, '');
  const firstColon = filtered.indexOf(':');
  const hasColon = firstColon >= 0;
  const digitsOnly = filtered.replace(/:/g, '');
  if (!hasColon) {
    if (digitsOnly.length <= 2) {
      return digitsOnly;
    }
    return `${digitsOnly.slice(0, 2)}:${digitsOnly.slice(2, 4)}`;
  }
  const minutes = filtered
    .slice(0, firstColon)
    .replace(/[^\d]/g, '')
    .slice(0, 2);
  const seconds = filtered
    .slice(firstColon + 1)
    .replace(/[^\d]/g, '')
    .slice(0, 2);
  return `${minutes}:${seconds}`;
}

export function formatSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function selectTimeSegment(target: HTMLInputElement): void {
  const caret = target.selectionStart ?? 0;
  if (caret <= 2) {
    target.setSelectionRange(0, 2);
    return;
  }
  target.setSelectionRange(3, 5);
}

export interface MetronomeInputHandlers {
  intervalTotalInput: Ref<string>;
  intervalInput: Ref<string>;
  bpmIncrementInput: Ref<string>;
  metronomeStore: ReturnType<typeof useMetronomeStore>;
}

export function createIntervalInputHandlers(deps: MetronomeInputHandlers) {
  function commitIntervalTotalInput(): void {
    const parsed = parseTimeInput(deps.intervalTotalInput.value);
    if (parsed === null) {
      deps.intervalTotalInput.value = '00:00';
      return;
    }
    deps.metronomeStore.setIntervalTotalDurationSeconds(parsed);
    deps.intervalTotalInput.value = formatSeconds(parsed);
  }

  function handleIntervalTotalInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    deps.intervalTotalInput.value = sanitizeTimeDraft(target.value);
  }

  function commitIntervalTotalInputFromEnter(event: KeyboardEvent): void {
    commitIntervalTotalInput();
    (event.target as HTMLInputElement | null)?.blur();
  }

  function commitIntervalInput(): void {
    const parsed = parseTimeInput(deps.intervalInput.value);
    if (parsed === null) {
      deps.intervalInput.value = '00:00';
      return;
    }
    deps.metronomeStore.setIntervalDurationSeconds(parsed);
    deps.intervalInput.value = formatSeconds(parsed);
  }

  function handleIntervalInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    deps.intervalInput.value = sanitizeTimeDraft(target.value);
  }

  function commitIntervalInputFromEnter(event: KeyboardEvent): void {
    commitIntervalInput();
    (event.target as HTMLInputElement | null)?.blur();
  }

  function handleIncrementInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    deps.bpmIncrementInput.value = target.value
      .replace(/[^\d]/g, '')
      .slice(0, 3);
  }

  function commitIncrementInput(): void {
    const parsed = Number(deps.bpmIncrementInput.value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      deps.bpmIncrementInput.value = '';
      return;
    }
    deps.metronomeStore.setIntervalBpmIncrement(parsed);
    deps.bpmIncrementInput.value = String(Math.max(0, Math.round(parsed)));
  }

  function commitIncrementInputFromEnter(event: KeyboardEvent): void {
    commitIncrementInput();
    (event.target as HTMLInputElement | null)?.blur();
  }

  return {
    commitIntervalTotalInput,
    handleIntervalTotalInput,
    commitIntervalTotalInputFromEnter,
    commitIntervalInput,
    handleIntervalInput,
    commitIntervalInputFromEnter,
    handleIncrementInput,
    commitIncrementInput,
    commitIncrementInputFromEnter,
  };
}
