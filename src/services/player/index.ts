export type {
  AlphaTabEventEmitter,
  AlphaTabMetronomeEventPayload,
  AlphaTabPlayerStatePayload,
  AlphaTabTrack,
  AlphaTabScore,
  AlphaTabScoreSnapshot,
  AlphaTabApiLike,
  AlphaTabSettings,
  AlphaTabApiFactory,
  AlphaTabPlayerOptions,
  AlphaTabPlayer,
  AlphaTabBeatInfo,
  VibratoKind,
  MidiRebuildContext,
  TempoPoint,
  LoopRangeMs,
  PitchBendDebugEvent,
  PitchBendDebugBeat,
  PitchBendDebugLookup,
  PitchBendSegment,
  SlidePlaybackSettingsLike,
} from './types';

export {
  ALPHATAB_FONT_DIR,
  ALPHATAB_FONT_CHECK_FILE,
  ALPHATAB_SOUNDFONT_FILE,
  ALPHATAB_TEXT_FONT_FAMILY,
  ALPHATAB_COLORS,
  PITCH_BEND_CENTER,
  PITCH_BEND_MAX,
  VIB_DEPTH_CENTS_DEFAULT,
  VIB_DEPTH_CENTS_WIDE,
  VIB_RATE_HZ_DEFAULT,
  VIB_RATE_HZ_WIDE,
} from './types';

export {
  resolveProgramForTrack,
  getAlphaTabFontDirectory,
  getAlphaTabSoundFontUrl,
  base64ToUint8Array,
  buildSettings,
  buildAlphaTabElementFonts,
  trackHasPlayableNotation,
  resolveEffectiveMidiTickShift,
} from './utils';

export {
  applyAlphaTabTempoShift,
  applyAlphaTabTextLineSpacing,
  EXTRA_LINE_SPACING_PX,
  TEMPO_EXTRA_UP_PX,
} from './alphaTabTextSpacing';
export { buildAudioEvents } from './midiEventBuilder';
export { buildVibratoWindows, resolveVibrato } from './vibrato';
export { buildHarmonicMap, buildLegatoSlideEvents } from './scoreAnalysis';
export {
  buildFadeExpressionEvents,
  buildLetRingEndMap,
} from './fadeAndLetRing';
export { hasMeaningfulTempoChanges } from './tempoMap';
export { createAlphaTabPlayer } from './createPlayer';
export { alphatabPlayer } from './singleton';

import { buildAudioEvents } from './midiEventBuilder';
import { buildVibratoWindows, resolveVibrato } from './vibrato';
import {
  buildFadeExpressionEvents,
  buildLetRingEndMap,
} from './fadeAndLetRing';
import { buildHarmonicMap } from './scoreAnalysis';
import { hasMeaningfulTempoChanges } from './tempoMap';
import {
  resolveEffectiveMidiTickShift,
  trackHasPlayableNotation,
} from './utils';

export const __test__ = {
  buildAudioEvents,
  buildVibratoWindows,
  buildFadeExpressionEvents,
  buildHarmonicMap,
  buildLetRingEndMap,
  resolveVibrato,
  hasMeaningfulTempoChanges,
  resolveEffectiveMidiTickShift,
  trackHasPlayableNotation,
};
