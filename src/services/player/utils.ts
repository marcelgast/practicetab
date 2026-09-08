import {
  AlphaTabApi,
  NotationElement,
  PlayerMode,
  TabRhythmMode,
  type Settings,
} from '@coderline/alphatab';
import {
  ALPHATAB_COLORS,
  ALPHATAB_FONT_DIR,
  ALPHATAB_SOUNDFONT_FILE,
  ALPHATAB_TEXT_FONT_FAMILY,
  type AlphaTabApiFactory,
  type AlphaTabSettings,
  type AlphaTabTrack,
} from './types';
import type { ATStaff, ATBar, ATVoice, ATBeat, ATNote } from './alphaTabTypes';

export function isTauriRuntime(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
    ((window as unknown as { __TAURI__?: unknown }).__TAURI__ ||
      (window as unknown as { __TAURI_INTERNALS__?: unknown })
        .__TAURI_INTERNALS__),
  );
}

export function safeArray<T = unknown>(getter: () => unknown): T[] {
  try {
    const value = getter();
    return Array.isArray(value) ? (value as T[]) : [];
  } catch {
    return [];
  }
}

export function safeTrackStaves(track: unknown): ATStaff[] {
  return safeArray<ATStaff>(
    () => (track as { staves?: unknown } | null)?.staves,
  );
}

export function resolveProgramForTrack(
  trackIndex: number,
  program: number,
  trackProgramsByIndex?: Map<number, number>,
): number {
  const override = trackProgramsByIndex?.get(trackIndex);
  if (typeof override === 'number' && Number.isFinite(override)) {
    return override;
  }
  return program;
}

export function getAlphaTabFontDirectory(): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : '';
  const base = origin && origin !== 'null' ? origin : '';
  if (!base) {
    return ALPHATAB_FONT_DIR;
  }
  return new URL(ALPHATAB_FONT_DIR, base).toString();
}

export function getAlphaTabSoundFontUrl(): string {
  return `${getAlphaTabFontDirectory()}${ALPHATAB_SOUNDFONT_FILE}`;
}

export const defaultApiFactory: AlphaTabApiFactory = (container, settings) =>
  new AlphaTabApi(container, settings);

function buildTextFont(
  size: number,
  options: { bold?: boolean; italic?: boolean } = {},
): string {
  const weight = options.bold ? 'bold ' : '';
  const style = options.italic ? 'italic ' : '';
  return `${weight}${style}${size}px ${ALPHATAB_TEXT_FONT_FAMILY}`;
}

// Override AlphaTab's default serif/italic fonts for text rendered inside
// the score (text blocks, words, markers, lyrics, header info, track names).
// Music glyph fonts (tablature numbers, grace notes, fretboard numbers) are
// left untouched so notation stays crisp. Sizes are nudged up slightly vs.
// AlphaTab defaults for better legibility and line spacing in multi-line
// text blocks (EffectText, the beat-text annotations above bars).
export function buildAlphaTabElementFonts(): Map<NotationElement, string> {
  return new Map<NotationElement, string>([
    [NotationElement.ScoreTitle, buildTextFont(32, { bold: true })],
    [NotationElement.ScoreSubTitle, buildTextFont(22)],
    [NotationElement.ScoreArtist, buildTextFont(18)],
    [NotationElement.ScoreAlbum, buildTextFont(16)],
    [NotationElement.ScoreWords, buildTextFont(17)],
    [NotationElement.ScoreMusic, buildTextFont(17)],
    [NotationElement.ScoreWordsAndMusic, buildTextFont(17)],
    [NotationElement.ScoreCopyright, buildTextFont(13)],
    [NotationElement.EffectMarker, buildTextFont(15, { bold: true })],
    [NotationElement.EffectLyrics, buildTextFont(14)],
    [NotationElement.EffectDirections, buildTextFont(15)],
    [NotationElement.EffectChordNames, buildTextFont(14)],
    [NotationElement.EffectCapo, buildTextFont(13)],
    // Beat-text annotations (GP "Text" feature). This is the multi-line
    // text block that sits above a bar — was the visible bug in the
    // user report, previously rendered in italic Georgia serif.
    [NotationElement.EffectText, buildTextFont(15)],
    [NotationElement.EffectTempo, buildTextFont(14, { bold: true })],
    [NotationElement.TrackNames, buildTextFont(13)],
  ]);
}

export function buildSettings(settings?: AlphaTabSettings): AlphaTabSettings {
  const base = settings ?? {};
  const typed = base as Settings;
  const existingCore =
    typeof typed.core === 'object' && typed.core ? typed.core : {};
  const existingDisplay =
    typeof typed.display === 'object' && typed.display ? typed.display : {};
  const existingResources =
    typeof (existingDisplay as Settings['display'])?.resources === 'object' &&
    (existingDisplay as Settings['display'])?.resources
      ? (existingDisplay as Settings['display'])?.resources
      : {};
  const existingNotation =
    typeof typed.notation === 'object' && typed.notation ? typed.notation : {};
  const existingPlayer =
    typeof typed.player === 'object' && typed.player ? typed.player : {};
  const useWorkers =
    typeof (existingCore as Settings['core'])?.useWorkers === 'boolean'
      ? (existingCore as Settings['core']).useWorkers
      : false;
  return {
    ...typed,
    core: {
      ...existingCore,
      fontDirectory: getAlphaTabFontDirectory(),
      useWorkers,
      // Lazy loading skips appending off-screen partials to the DOM
      // for perf. That breaks the one-liner horizontal layout — as
      // the user scrolls right, bars past the initial viewport aren't
      // in the SVG, producing visible cutoff at the end of the tab.
      // Disabling it renders the whole score upfront; our tabs are
      // small enough that the hit is a non-issue.
      enableLazyLoading: false,
    },
    display: {
      ...existingDisplay,
      resources: {
        ...existingResources,
        staffLineColor: ALPHATAB_COLORS.staffLine,
        barSeparatorColor: ALPHATAB_COLORS.barSeparator,
        barNumberColor: ALPHATAB_COLORS.barNumber,
        mainGlyphColor: ALPHATAB_COLORS.mainGlyph,
        secondaryGlyphColor: ALPHATAB_COLORS.secondaryGlyph,
        scoreInfoColor: ALPHATAB_COLORS.scoreInfo,
        elementFonts: buildAlphaTabElementFonts(),
      },
      firstSystemPaddingTop: 16,
      systemPaddingTop: 28,
      systemPaddingBottom: 28,
      lastSystemPaddingBottom: 52,
      firstNotationStaffPaddingTop: 12,
      notationStaffPaddingTop: 12,
      notationStaffPaddingBottom: 14,
      lastNotationStaffPaddingBottom: 20,
      trackStaffPaddingBetween: 14,
      // Padding below each effect band. Applied between effect bands AND
      // after the last band before the music lines, so bumping this from
      // the default 2 → 18 gives roughly a line-height of breathing room
      // between the score-text annotations and the first staff line.
      effectBandPaddingBottom: 18,
    },
    notation: {
      ...existingNotation,
      rhythmMode: TabRhythmMode.ShowWithBars,
    },
    player: {
      ...existingPlayer,
      playerMode: PlayerMode.EnabledExternalMedia,
      enablePlayer: true,
      enableCursor: true,
      enableUserInteraction: true,
      enableElementHighlighting: true,
    },
  };
}

export function base64ToUint8Array(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  if (typeof Buffer !== 'undefined') {
    return Uint8Array.from(Buffer.from(base64, 'base64'));
  }
  throw new Error('Base64 decoding is not available in this environment.');
}

export function clampMidiKey(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value)));
}

export function harmonicOffsetFromValue(value: number): number {
  const rounded = Math.round(value);
  if (Math.abs(rounded - 12) <= 1) {
    return 12;
  }
  if (Math.abs(rounded - 7) <= 1) {
    return 19;
  }
  if (Math.abs(rounded - 5) <= 1) {
    return 24;
  }
  if (Math.abs(rounded - 4) <= 1) {
    return 28;
  }
  return 0;
}

export function clampTempoPercent(tempoPercent: number): number {
  if (!Number.isFinite(tempoPercent)) {
    return 100;
  }
  return Math.max(25, Math.min(200, Math.round(tempoPercent)));
}

export function clampTempoFactorForOverride(factor: number): number {
  if (!Number.isFinite(factor)) {
    return 1;
  }
  return Math.max(0.05, Math.min(16, factor));
}

export function trackHasPlayableNotation(track: AlphaTabTrack): boolean {
  const staves = safeTrackStaves(track);
  for (const staff of staves) {
    const bars = safeArray<ATBar>(() => staff?.bars);
    for (const bar of bars) {
      const voices = safeArray<ATVoice>(() => bar?.voices);
      for (const voice of voices) {
        const beats = safeArray<ATBeat>(() => voice?.beats);
        for (const beat of beats) {
          if (!beat || beat.isRest === true) {
            continue;
          }
          const notes = safeArray<ATNote>(() => beat?.notes);
          const hasPlayable =
            notes.length === 0 || notes.some((note) => note?.isRest !== true);
          if (hasPlayable) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

export function resolveEffectiveMidiTickShift(
  _rawTickShift: number,
  _firstPlayableTickRaw: number | null,
  _midiDivision: number,
  _hasNonPlayableTracks: boolean,
): number {
  void _rawTickShift;
  void _firstPlayableTickRaw;
  void _midiDivision;
  void _hasNonPlayableTracks;
  // PracticeTab transport is notation-first; attached audio offsets are ignored.
  return 0;
}

export function resolveTimeSignatureFromSource(
  source: unknown,
): { top: number; bottom: number } | null {
  const barAny = source as
    | {
        timeSignatureNumerator?: number;
        timeSignatureDenominator?: number;
        timeSignature?: { numerator?: number; denominator?: number };
      }
    | undefined;
  if (!barAny) {
    return null;
  }
  const top = barAny.timeSignatureNumerator ?? barAny.timeSignature?.numerator;
  const bottom =
    barAny.timeSignatureDenominator ?? barAny.timeSignature?.denominator;
  if (typeof top !== 'number' || typeof bottom !== 'number') {
    return null;
  }
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) {
    return null;
  }
  return { top: Math.round(top), bottom: Math.round(bottom) };
}

export function getRectThreshold(rect: DOMRect): number {
  const base = rect.height > 0 ? rect.height * 1.4 : 60;
  return Math.max(40, Math.min(140, base));
}
