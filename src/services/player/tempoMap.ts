import { midi } from '@coderline/alphatab';
import type { AudioTabEvent } from '../audioTabCommands';
import type { TempoPoint } from './types';
import { PITCH_BEND_CENTER } from './types';

type MidiEvent = midi.MidiEvent;

export function buildTempoMap(
  events: MidiEvent[],
  division: number,
  tickShift: number,
  initialUsPerQuarter = 500000,
): TempoPoint[] {
  const map: TempoPoint[] = [];
  let currentTempo = initialUsPerQuarter;
  let currentTick = 0;
  let currentTimeMs = 0;
  map.push({ tick: 0, timeMs: 0, usPerQuarter: currentTempo });
  for (const event of events) {
    const shiftedTick = event.tick - tickShift;
    if (shiftedTick < 0) {
      if (event.type === midi.MidiEventType.TempoChange) {
        const tempoEvent = event as midi.TempoChangeEvent;
        const nextTempo =
          typeof tempoEvent.microSecondsPerQuarterNote === 'number'
            ? tempoEvent.microSecondsPerQuarterNote
            : currentTempo;
        currentTempo = nextTempo;
      }
      continue;
    }
    const deltaTicks = shiftedTick - currentTick;
    if (deltaTicks > 0) {
      currentTimeMs += (deltaTicks * currentTempo) / division / 1000;
      currentTick = shiftedTick;
    }
    if (event.type === midi.MidiEventType.TempoChange) {
      const tempoEvent = event as midi.TempoChangeEvent;
      const nextTempo =
        typeof tempoEvent.microSecondsPerQuarterNote === 'number'
          ? tempoEvent.microSecondsPerQuarterNote
          : currentTempo;
      currentTempo = nextTempo;
      map.push({
        tick: currentTick,
        timeMs: currentTimeMs,
        usPerQuarter: currentTempo,
      });
    }
  }
  return map;
}

export function hasMeaningfulTempoChanges(tempoMap: TempoPoint[]): boolean {
  if (tempoMap.length <= 1) {
    return false;
  }
  const firstTick = tempoMap[0]?.tick ?? 0;
  let baselineUsPerQuarter: number | null = null;
  for (const point of tempoMap) {
    if (point.tick !== firstTick) {
      break;
    }
    if (Number.isFinite(point.usPerQuarter) && point.usPerQuarter > 0) {
      baselineUsPerQuarter = point.usPerQuarter;
    }
  }
  if (!baselineUsPerQuarter) {
    return false;
  }
  const baselineBpm = 60_000_000 / baselineUsPerQuarter;
  for (const point of tempoMap) {
    if (point.tick <= firstTick) {
      continue;
    }
    if (!Number.isFinite(point.usPerQuarter) || point.usPerQuarter <= 0) {
      continue;
    }
    const bpm = 60_000_000 / point.usPerQuarter;
    if (Math.abs(bpm - baselineBpm) > 0.01) {
      return true;
    }
  }
  return false;
}

export function tickToMs(
  tick: number,
  division: number,
  tempoMap: TempoPoint[],
): number {
  if (tempoMap.length === 0) {
    return 0;
  }
  let point = tempoMap[0];
  for (const candidate of tempoMap) {
    if (candidate.tick <= tick) {
      point = candidate;
    } else {
      break;
    }
  }
  const deltaTicks = tick - point.tick;
  const deltaMs = (deltaTicks * point.usPerQuarter) / division / 1000;
  return point.timeMs + deltaMs;
}

export function msToTick(
  timeMs: number,
  division: number,
  tempoMap: TempoPoint[],
): number {
  if (tempoMap.length === 0) {
    return 0;
  }
  let point = tempoMap[0];
  for (const candidate of tempoMap) {
    if (candidate.timeMs <= timeMs) {
      point = candidate;
    } else {
      break;
    }
  }
  const deltaMs = timeMs - point.timeMs;
  const deltaTicks = (deltaMs * division * 1000) / point.usPerQuarter;
  return Math.max(0, Math.round(point.tick + deltaTicks));
}

function eventPriority(kind: AudioTabEvent['kind']): number {
  switch (kind.type) {
    case 'control_change':
      return 0;
    case 'program_change':
      return 1;
    case 'pitch_bend':
      return 2;
    case 'note_off':
      return 3;
    case 'note_on':
      return 4;
    default:
      return 5;
  }
}

export function compareAudioEvents(a: AudioTabEvent, b: AudioTabEvent): number {
  const timeDiff = a.atMs - b.atMs;
  if (Math.abs(timeDiff) > 1e-9) {
    return timeDiff;
  }
  return eventPriority(a.kind) - eventPriority(b.kind);
}

export function normalizePitchBendValue(raw: number): number {
  if (!Number.isFinite(raw)) {
    return 8192;
  }
  if (raw >= 0 && raw <= 16383) {
    return raw;
  }
  if (raw >= -1 && raw <= 1) {
    const scaled = Math.round((raw + 1) * 8191.5);
    return Math.max(0, Math.min(16383, scaled));
  }
  if (raw >= 0 && raw <= 1) {
    const scaled = Math.round(raw * 16383);
    return Math.max(0, Math.min(16383, scaled));
  }
  if (raw >= 0 && raw <= 127) {
    const normalized = (raw - 64) / 64;
    const scaled = Math.round((normalized + 1) * 8191.5);
    return Math.max(0, Math.min(16383, scaled));
  }
  if (raw >= -8192 && raw <= 8191) {
    return Math.max(0, Math.min(16383, raw + 8192));
  }
  // MIDI 2.0 per-note pitch bend can arrive as unsigned 32-bit values.
  // Map full range [0..0xFFFFFFFF] into the 14-bit synth bend range.
  if (raw >= 0 && raw <= 4294967295) {
    const scaled = Math.round((raw / 4294967295) * 16383);
    return Math.max(0, Math.min(16383, scaled));
  }
  const min = -2147483648;
  const max = 2147483647;
  const clamped = Math.max(min, Math.min(max, raw));
  const scaled = Math.round(((clamped - min) / (max - min)) * 16383);
  return Math.max(0, Math.min(16383, scaled));
}

export { PITCH_BEND_CENTER };
