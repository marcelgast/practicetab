// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { __test__ } from '../services/alphatabPlayer';

describe('resolveVibrato', () => {
  it('uses beat-level vibrato when note-level is none', () => {
    const result = __test__.resolveVibrato({
      note: { vibrato: 0 },
      beat: { vibrato: 2 },
      voice: {},
    });
    expect(result).toBe('wide');
  });

  it('uses note-level vibrato when present', () => {
    const result = __test__.resolveVibrato({
      note: { vibrato: 1 },
      beat: { vibrato: 2 },
      voice: {},
    });
    expect(result).toBe('slight');
  });

  it('uses voice-level vibrato when note and beat are none', () => {
    const result = __test__.resolveVibrato({
      note: {},
      beat: {},
      voice: { vibrato: 'wide' },
    });
    expect(result).toBe('wide');
  });

  it('returns none when no vibrato is present', () => {
    const result = __test__.resolveVibrato({
      note: { vibrato: 0 },
      beat: { vibrato: 0 },
      voice: { vibrato: 0 },
    });
    expect(result).toBe('none');
  });

  it('reads vibrato from beat properties when not trem-bar', () => {
    const result = __test__.resolveVibrato({
      note: {},
      beat: {
        properties: [{ name: 'Vibrato', strength: 'Slight' }],
      },
      voice: {},
    });
    expect(result).toBe('slight');
  });

  it('ignores trem-bar vibrato properties for note vibrato', () => {
    const result = __test__.resolveVibrato({
      note: {},
      beat: {
        properties: [{ name: 'VibratoWTremBar', strength: 'Slight' }],
      },
      voice: {},
    });
    expect(result).toBe('none');
  });
});
