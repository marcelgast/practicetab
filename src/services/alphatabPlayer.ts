/**
 * Thin re-export shim — all implementation lives in `./player/`.
 * Existing imports from `'../services/alphatabPlayer'` continue to work.
 */
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
} from './player';

export {
  ALPHATAB_FONT_DIR,
  ALPHATAB_FONT_CHECK_FILE,
  ALPHATAB_SOUNDFONT_FILE,
  ALPHATAB_TEXT_FONT_FAMILY,
  ALPHATAB_COLORS,
  resolveProgramForTrack,
  getAlphaTabFontDirectory,
  getAlphaTabSoundFontUrl,
  base64ToUint8Array,
  buildSettings,
  buildAlphaTabElementFonts,
  applyAlphaTabTempoShift,
  applyAlphaTabTextLineSpacing,
  EXTRA_LINE_SPACING_PX,
  TEMPO_EXTRA_UP_PX,
  createAlphaTabPlayer,
  alphatabPlayer,
  __test__,
} from './player';
