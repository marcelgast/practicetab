/**
 * Resolve a persisted audio-device id back to a live device entry,
 * tolerating cpal's index instability across app restarts.
 *
 * Rust assigns ids of the form `{host}|{name}|{index}` (see
 * `src-tauri/src/audio/input/devices.rs::device_id_for`). The
 * `index` part is the position in `host.input_devices()` /
 * `host.output_devices()` at enumeration time. CoreAudio + WASAPI
 * routinely reorder that list when an unrelated USB device is
 * plugged in or out, so the same physical interface can come back
 * with a new index between sessions.
 *
 * The Rust side already falls back to name-only matching when it
 * resolves a stored id back to a device, but the frontend's
 * `syncInputDevice` / `syncOutputDevice` was doing strict
 * `device.id === stored` matching and bailing out — wiping the
 * persisted id in the process. End-user impact: a Scarlett 4i4
 * left plugged in across restarts would silently drop back to
 * System Default and the persisted choice would be permanently
 * gone from localStorage.
 *
 * This helper closes that gap with the same matching tiers Rust
 * uses, and it stays pure (no I/O, no Vue) so the unit test
 * doesn't need a real cpal host.
 */

export interface AudioDeviceLike {
  id: string;
  name: string;
}

export interface ResolvedAudioDevice<T extends AudioDeviceLike> {
  /** The matched device. */
  device: T;
  /**
   * `'exact'` when the persisted id matched an entry as-is.
   * `'name'` when only the parsed name matched (id drifted, e.g.
   * cpal renumbered indices). Callers should rewrite the persisted
   * id to `device.id` so future launches hit the exact path.
   */
  via: 'exact' | 'name';
}

/**
 * Parse the device-name segment out of `{host}|{name}|{index}`.
 * Returns null when the id doesn't fit that shape (e.g. the
 * synthetic `'default'` sentinel, or pre-format ids from older
 * versions). Name segments themselves can contain spaces or even
 * pipes — splitting on `|` and taking everything between the first
 * and last segment handles the rare device that has a `|` in its
 * name.
 */
export function parseAudioDeviceName(deviceId: string): string | null {
  const parts = deviceId.split('|');
  if (parts.length < 3) return null;
  // host = parts[0], index = parts.at(-1), name = everything between.
  const name = parts.slice(1, -1).join('|').trim();
  return name.length > 0 ? name : null;
}

/**
 * Find the persisted device in a fresh enumeration.
 * Tier 1: exact id match.
 * Tier 2: name match (id drifted).
 * Returns null when the device is genuinely gone — caller should
 * route to default for this session but MUST NOT clear the
 * persisted id, because the device may come back later.
 *
 * The synthetic `'default'` id is treated as an exact id like any
 * other; callers add it to their device list before calling here.
 */
export function resolveAudioDevice<T extends AudioDeviceLike>(
  persistedId: string | null,
  devices: readonly T[],
): ResolvedAudioDevice<T> | null {
  if (!persistedId) return null;
  const exact = devices.find((d) => d.id === persistedId);
  if (exact) return { device: exact, via: 'exact' };
  const name = parseAudioDeviceName(persistedId);
  if (!name) return null;
  const byName = devices.find((d) => d.name === name);
  if (byName) return { device: byName, via: 'name' };
  return null;
}

/**
 * Whether the Settings picker should inject a synthetic
 * "(offline)" entry for `draftId` because the persisted device
 * isn't in the live `devices` list.
 *
 * Without that injection, AppSelect silently falls back to its
 * first option (System Default) when the model value doesn't
 * match — so the dropdown lies about what's selected while the
 * draft still holds the offline id. Apply then re-persists the
 * offline id instead of the System Default the user thinks they
 * picked. The synthetic option closes that desync.
 *
 * `null`, `''` and the synthetic `'default'` sentinel never need
 * a placeholder.
 */
export function shouldShowOfflineDeviceOption(
  draftId: string | null,
  devices: readonly AudioDeviceLike[],
): boolean {
  if (!draftId || draftId === 'default') return false;
  return !devices.some((d) => d.id === draftId);
}

/**
 * Human-readable label for the synthetic offline entry. Recovers
 * the device name from `{host}|{name}|{index}` when possible so
 * the user sees "Scarlett 4i4 (offline)" instead of an opaque id.
 */
export function buildOfflineDeviceLabel(deviceId: string): string {
  const name = parseAudioDeviceName(deviceId);
  return name ? `${name} (offline)` : 'Saved device (offline)';
}
