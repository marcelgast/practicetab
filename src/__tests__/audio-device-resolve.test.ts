import { describe, expect, it } from 'vitest';
import {
  buildOfflineDeviceLabel,
  parseAudioDeviceName,
  resolveAudioDevice,
  shouldShowOfflineDeviceOption,
} from '../domain/audioDeviceResolve';

interface TestDevice {
  id: string;
  name: string;
}

describe('parseAudioDeviceName', () => {
  it('extracts the middle segment from {host}|{name}|{index}', () => {
    expect(parseAudioDeviceName('CoreAudio|Scarlett 4i4|2')).toBe(
      'Scarlett 4i4',
    );
    expect(parseAudioDeviceName('Wasapi|Focusrite USB|0')).toBe(
      'Focusrite USB',
    );
  });

  it('preserves names that themselves contain a pipe', () => {
    // Defensive — unlikely but possible. Splitting + re-joining the
    // middle slice keeps the pipe inside the name.
    expect(parseAudioDeviceName('CoreAudio|odd | name|3')).toBe('odd | name');
  });

  it('returns null for ids that do not fit the format', () => {
    expect(parseAudioDeviceName('default')).toBe(null);
    expect(parseAudioDeviceName('')).toBe(null);
    expect(parseAudioDeviceName('only|two')).toBe(null);
    // Empty middle segment treated as no name.
    expect(parseAudioDeviceName('CoreAudio||4')).toBe(null);
  });
});

describe('resolveAudioDevice', () => {
  const devices: TestDevice[] = [
    { id: 'default', name: 'System Default' },
    {
      id: 'CoreAudio|MacBook Pro Microphone|0',
      name: 'MacBook Pro Microphone',
    },
    { id: 'CoreAudio|Scarlett 4i4|1', name: 'Scarlett 4i4' },
  ];

  it('returns null when nothing is persisted', () => {
    expect(resolveAudioDevice(null, devices)).toBe(null);
  });

  it('returns null when persisted id is empty string', () => {
    expect(resolveAudioDevice('', devices)).toBe(null);
  });

  it('matches the synthetic default sentinel exactly', () => {
    const result = resolveAudioDevice('default', devices);
    expect(result?.via).toBe('exact');
    expect(result?.device.id).toBe('default');
  });

  it('returns an exact match when the id is unchanged across launches', () => {
    const result = resolveAudioDevice('CoreAudio|Scarlett 4i4|1', devices);
    expect(result?.via).toBe('exact');
    expect(result?.device.name).toBe('Scarlett 4i4');
  });

  it('falls back to name match when the index drifted', () => {
    // cpal renumbered: device used to be at index 2, now at index 1.
    // Persisted id is the old one, but the device by name is still
    // present. This is the exact bug Marcel reported.
    const result = resolveAudioDevice('CoreAudio|Scarlett 4i4|2', devices);
    expect(result?.via).toBe('name');
    expect(result?.device.id).toBe('CoreAudio|Scarlett 4i4|1');
  });

  it('falls back across host changes (different host segment)', () => {
    // Saved on Wasapi, now running on CoreAudio (uncommon but
    // possible after an OS reinstall — better to recover than not).
    const result = resolveAudioDevice('Wasapi|Scarlett 4i4|0', devices);
    expect(result?.via).toBe('name');
    expect(result?.device.id).toBe('CoreAudio|Scarlett 4i4|1');
  });

  it('returns null when the device is genuinely gone', () => {
    // Caller is expected to NOT clear the persisted id in this
    // case — the device may come back next launch.
    const result = resolveAudioDevice('CoreAudio|Some Other Mic|5', devices);
    expect(result).toBe(null);
  });

  it('returns null for malformed ids that have no parseable name', () => {
    const result = resolveAudioDevice('legacy-stored-id', devices);
    expect(result).toBe(null);
  });
});

describe('shouldShowOfflineDeviceOption', () => {
  const devices: TestDevice[] = [
    { id: 'default', name: 'System Default' },
    { id: 'CoreAudio|Scarlett 4i4|1', name: 'Scarlett 4i4' },
  ];

  it('returns false for null / empty / default sentinels', () => {
    expect(shouldShowOfflineDeviceOption(null, devices)).toBe(false);
    expect(shouldShowOfflineDeviceOption('', devices)).toBe(false);
    expect(shouldShowOfflineDeviceOption('default', devices)).toBe(false);
  });

  it('returns false when the draft id is in the live list', () => {
    expect(
      shouldShowOfflineDeviceOption('CoreAudio|Scarlett 4i4|1', devices),
    ).toBe(false);
  });

  it('returns true when the draft id is missing from the live list', () => {
    expect(
      shouldShowOfflineDeviceOption('CoreAudio|Scarlett 4i4|9', devices),
    ).toBe(true);
  });
});

describe('buildOfflineDeviceLabel', () => {
  it('recovers the device name from a {host}|{name}|{index} id', () => {
    expect(buildOfflineDeviceLabel('CoreAudio|Scarlett 4i4|2')).toBe(
      'Scarlett 4i4 (offline)',
    );
  });

  it('falls back to a generic label when the id has no parseable name', () => {
    expect(buildOfflineDeviceLabel('legacy-stored-id')).toBe(
      'Saved device (offline)',
    );
  });
});
