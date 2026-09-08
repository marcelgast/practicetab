import { invoke } from '@tauri-apps/api/core';
import { midi, type Settings } from '@coderline/alphatab';
import { alphatabPlayer } from './alphatabPlayer';

type MidiGeneratorScore = ConstructorParameters<
  typeof midi.MidiFileGenerator
>[0];

function isTauriRuntime(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
    ((window as unknown as { __TAURI__?: unknown }).__TAURI__ ||
      (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__),
  );
}

export function buildMidiBytesForScore(
  score: MidiGeneratorScore,
  settings: Settings | null,
): Uint8Array {
  const midiFile = new midi.MidiFile();
  const handler = new midi.AlphaSynthMidiFileHandler(midiFile, true);
  const generator = new midi.MidiFileGenerator(score, settings, handler);
  generator.applyTranspositionPitches = true;
  generator.generate();
  return midiFile.toBinary();
}

export async function getCurrentScoreMidi(): Promise<Uint8Array> {
  const context = alphatabPlayer.getCurrentScoreContext?.() ?? null;
  if (!context) {
    throw new Error('alphatab_score_not_loaded');
  }
  return buildMidiBytesForScore(
    context.score as unknown as MidiGeneratorScore,
    context.settings,
  );
}

export async function exportCurrentMidiToRust(): Promise<Uint8Array> {
  const midiBytes = await getCurrentScoreMidi();
  if (isTauriRuntime()) {
    await invoke('audio_tab_set_current_midi', {
      midiBytes: Array.from(midiBytes),
    });
  }
  return midiBytes;
}
