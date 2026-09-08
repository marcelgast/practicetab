import type { Ref } from 'vue';
import { alphatabPlayer as alphatabPlayerSingleton } from '../../services/alphatabPlayer';
import {
  resolveMetronomeSyncFromBeatmap,
  type MetronomeSyncResolveReason,
} from '../../services/metronomeSyncResolver';
import type { MetronomeBarInfo } from '../../services/metronomeSchedule';
import type { MetronomeConfig } from '../../services/metronomeCommands';
import type { PlayerModel } from '../../domain/player';
import type { useBeatmapStore } from '../beatmap';
import type { useMetronomeStore, TimeSigBottom } from '../metronome';

const toTimeSigBottom = (value: number): TimeSigBottom =>
  ([1, 2, 4, 8, 16, 32].includes(value) ? value : 4) as TimeSigBottom;

export interface MetronomeSyncConfigDeps {
  alphatabPlayer: typeof alphatabPlayerSingleton;
  metronomeStore: ReturnType<typeof useMetronomeStore>;
  beatmapStore: ReturnType<typeof useBeatmapStore>;
  model: Ref<PlayerModel>;
  isLoopEnabled: Ref<boolean>;
  pendingMetronomeSyncAnchorTick: Ref<number | null>;
}

/**
 * Tick resolution and beatmap-based metronome config building.
 *
 * Pure query functions — no timers, no side effects beyond clearing
 * the anchor tick after use.
 */
export function createMetronomeSyncConfig(deps: MetronomeSyncConfigDeps) {
  const {
    alphatabPlayer,
    metronomeStore,
    beatmapStore,
    model,
    isLoopEnabled,
    pendingMetronomeSyncAnchorTick,
  } = deps;

  function resolveCurrentSyncTick(): {
    tick: number | null;
    source: 'beat_info' | 'transport' | 'audio' | 'none';
    beatInfoTick: number | null;
    transportTick: number | null;
    audioTick: number | null;
  } {
    const beatInfoTickRaw =
      typeof alphatabPlayer.getCurrentBeatInfo === 'function'
        ? alphatabPlayer.getCurrentBeatInfo()?.currentTick
        : null;
    const beatInfoTick =
      typeof beatInfoTickRaw === 'number' && Number.isFinite(beatInfoTickRaw)
        ? beatInfoTickRaw
        : null;
    if (beatInfoTick !== null) {
      return {
        tick: beatInfoTick,
        source: 'beat_info',
        beatInfoTick,
        transportTick: null,
        audioTick: null,
      };
    }
    const fromTransport =
      typeof alphatabPlayer.getCurrentTickPosition === 'function'
        ? alphatabPlayer.getCurrentTickPosition()
        : null;
    const transportTick =
      typeof fromTransport === 'number' && Number.isFinite(fromTransport)
        ? fromTransport
        : null;
    if (transportTick !== null) {
      return {
        tick: transportTick,
        source: 'transport',
        beatInfoTick,
        transportTick,
        audioTick: null,
      };
    }
    const fromAudio =
      typeof alphatabPlayer.getCurrentAudioTickPosition === 'function'
        ? alphatabPlayer.getCurrentAudioTickPosition()
        : null;
    const audioTick =
      typeof fromAudio === 'number' && Number.isFinite(fromAudio)
        ? fromAudio
        : null;
    if (audioTick !== null) {
      return {
        tick: audioTick,
        source: 'audio',
        beatInfoTick,
        transportTick,
        audioTick,
      };
    }
    return {
      tick: null,
      source: 'none',
      beatInfoTick,
      transportTick,
      audioTick,
    };
  }

  function collectMetronomeBarsFromAlphaTab(): MetronomeBarInfo[] {
    const count = alphatabPlayer.getBarCount();
    if (!Number.isFinite(count) || count <= 0) {
      return [];
    }
    const fallbackDivision = alphatabPlayer.getTickDivision() ?? 480;
    const bars: MetronomeBarInfo[] = [];
    for (let index = 0; index < count; index += 1) {
      const range = alphatabPlayer.getBarRangeTicks(index);
      if (!range) {
        continue;
      }
      const signature =
        alphatabPlayer.getBarTimeSignature(index) ??
        alphatabPlayer.getTimeSignatureAtTick(range.start);
      if (!signature) {
        continue;
      }
      const beatTicks = Math.max(
        1,
        Math.round((fallbackDivision * 4) / Math.max(1, signature.bottom)),
      );
      bars.push({
        startTick: range.start,
        endTick: range.end,
        timeSigTop: signature.top,
        timeSigBottom: signature.bottom,
        beatTicks: Math.max(1, Math.round(beatTicks)),
      });
    }
    return bars;
  }

  function buildBeatmapSyncedConfig(
    reason: MetronomeSyncResolveReason,
  ): MetronomeConfig | null {
    const itemId = model.value.currentLibraryItemId;
    if (!itemId) {
      return null;
    }
    const beatmap = beatmapStore.getEntry(itemId)?.beatmap;
    if (!beatmap) {
      return null;
    }
    const syncTick = resolveCurrentSyncTick();
    const anchorTick =
      typeof pendingMetronomeSyncAnchorTick.value === 'number'
        ? pendingMetronomeSyncAnchorTick.value
        : null;
    const currentTick = anchorTick ?? syncTick.tick;
    pendingMetronomeSyncAnchorTick.value = null;
    const loopRangeTicks =
      isLoopEnabled.value &&
      typeof alphatabPlayer.getPlaybackRangeTicks === 'function'
        ? alphatabPlayer.getPlaybackRangeTicks()
        : null;
    const bars = collectMetronomeBarsFromAlphaTab();
    const resolved = resolveMetronomeSyncFromBeatmap({
      beatmap,
      tempoPercent: model.value.tempoPercent,
      subdivisionsEnabled: metronomeStore.subdivisionsEnabled,
      subdivisionsValue: metronomeStore.subdivisionsValue,
      currentTick,
      currentMsOverride:
        typeof alphatabPlayer.getCurrentPositionMs === 'function'
          ? alphatabPlayer.getCurrentPositionMs()
          : null,
      tickToMs: (tick) =>
        typeof alphatabPlayer.tickToMs === 'function'
          ? alphatabPlayer.tickToMs(tick)
          : null,
      bars,
      loopRangeTicks,
      renderedSignatureAtTick:
        typeof currentTick === 'number'
          ? alphatabPlayer.getTimeSignatureAtTick(currentTick)
          : null,
      reason,
    });
    if (!resolved) {
      return null;
    }
    const top = Math.max(1, Math.round(resolved.timeSigTop));
    const config = metronomeStore.buildSyncedConfig({
      bpm: resolved.bpm,
      timeSigTop: top,
      timeSigBottom: toTimeSigBottom(resolved.timeSigBottom),
      beatStates: Array.from({ length: top }, (_, index) =>
        index === 0 ? 'accent' : 'normal',
      ),
      startBeatIndex: 0,
      startSubIndex: 0,
      startDelayMs: 0,
    });
    config.schedule = resolved.schedule.map((event) => ({
      offsetMs: event.offsetMs,
      kind: event.kind,
    }));
    config.scheduleLoopMs = resolved.scheduleLoopMs;
    config.scheduleStartOffsetMs = resolved.scheduleStartOffsetMs;
    return config;
  }

  return {
    resolveCurrentSyncTick,
    collectMetronomeBarsFromAlphaTab,
    buildBeatmapSyncedConfig,
  };
}
