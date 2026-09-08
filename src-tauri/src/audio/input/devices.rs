use cpal::traits::{DeviceTrait, HostTrait};

use super::types::InputDevice;

pub(crate) fn host_id_string(host_id: cpal::HostId) -> String {
    format!("{host_id:?}")
}

pub(crate) fn select_input_host() -> cpal::Host {
    #[cfg(target_os = "macos")]
    {
        if let Ok(host) = cpal::host_from_id(cpal::HostId::CoreAudio) {
            return host;
        }
    }
    cpal::default_host()
}

pub(crate) fn device_id_for(name: &str, host_id: cpal::HostId, index: usize) -> String {
    format!("{}|{}|{}", host_id_string(host_id), name, index)
}

pub(crate) fn list_input_devices_for_host(host: &cpal::Host) -> Vec<InputDevice> {
    let host_id = host.id();
    let default_device = host.default_input_device();
    let default_name = default_device
        .as_ref()
        .and_then(|device| device.name().ok());
    let devices = host
        .input_devices()
        .map(|devices| devices.collect::<Vec<_>>())
        .unwrap_or_default();
    if devices.is_empty() {
        return default_device
            .into_iter()
            .map(|device| {
                let name = device.name().unwrap_or_else(|_| "Unknown Input".into());
                let id = device_id_for(&name, host_id, 0);
                let channels = query_channel_count(&device);
                InputDevice {
                    id,
                    name: name.clone(),
                    is_default: default_name.as_ref() == Some(&name),
                    channels,
                }
            })
            .collect();
    }
    devices
        .into_iter()
        .enumerate()
        .map(|(index, device)| {
            let name = device.name().unwrap_or_else(|_| "Unknown Input".into());
            let id = device_id_for(&name, host_id, index);
            let channels = query_channel_count(&device);
            InputDevice {
                id,
                name: name.clone(),
                is_default: default_name.as_ref() == Some(&name),
                channels,
            }
        })
        .collect()
}

/// Best-effort MAX channel count the device exposes across every
/// supported configuration. `default_input_config()` alone is not
/// enough: CoreAudio / WASAPI frequently default a multi-input
/// interface to a stereo config even when the hardware actually has
/// 4, 8, or 18 inputs (e.g. Focusrite Scarlett 4i4/18i20). Iterating
/// `supported_input_configs()` and taking the max gives the real
/// upper bound that the Settings picker should expose. Falls back to
/// the default config's channels on enumeration failure, and `0` if
/// neither call succeeded — the frontend interprets `0` as "unknown"
/// and hides the channel picker.
fn query_channel_count(device: &cpal::Device) -> u16 {
    if let Ok(configs) = device.supported_input_configs() {
        let max = configs.map(|cfg| cfg.channels()).max();
        if let Some(n) = max {
            return n;
        }
    }
    device
        .default_input_config()
        .map(|cfg| cfg.channels())
        .unwrap_or(0)
}

pub(crate) fn list_input_devices(host: &cpal::Host) -> Vec<InputDevice> {
    let mut devices = list_input_devices_for_host(host);
    for host_id in cpal::available_hosts() {
        if host_id == host.id() {
            continue;
        }
        if let Ok(other_host) = cpal::host_from_id(host_id) {
            devices.extend(list_input_devices_for_host(&other_host));
        }
    }
    devices
}

/// Resolve a stored device id back to a cpal device.
///
/// When `id` is `None`, returns the primary host's default input device.
/// When `id` is `Some`, parses the encoded `{host}|{name}|{index}` tuple,
/// finds the matching host, and returns the best match inside it.
///
/// Resolution tiers on the matching host (first hit wins):
///   1. Name + index match — the stable-identity happy path.
///   2. Name match alone — recovers when the OS reordered devices (e.g.
///      plugging in an unrelated interface shifts indices). Typical cpal
///      behaviour on macOS/Windows: device names are stable, indices
///      are not.
///
/// If the stored host isn't in `cpal::available_hosts()` any more (rare
/// — the default host changed between sessions), we bail with
/// `device_not_found` rather than cross-host scan, because
/// `input_devices()` on some driver combos can block for minutes.
/// The user can reselect in Settings in that case.
///
/// Never silently falls back to a DIFFERENT device — we'd rather fail
/// loudly than send audio to the wrong input.
pub(crate) fn resolve_input_device(
    host: &cpal::Host,
    id: Option<&str>,
) -> Result<cpal::Device, String> {
    let Some(id) = id else {
        return host
            .default_input_device()
            .ok_or_else(|| "audio_input_default_device_missing".to_string());
    };
    let mut parts = id
        .split('|')
        .map(|part| part.to_string())
        .collect::<Vec<_>>();
    if parts.len() < 3 {
        return Err("audio_input_device_id_invalid".to_string());
    }
    let index = parts
        .pop()
        .and_then(|part| part.parse::<usize>().ok())
        .ok_or_else(|| "audio_input_device_id_invalid".to_string())?;
    let device_name = parts.pop().unwrap_or_default();
    let host_key = parts.join("|");

    for host_id in cpal::available_hosts() {
        if host_id_string(host_id) != host_key {
            continue;
        }
        let target_host = cpal::host_from_id(host_id)
            .map_err(|_| "audio_input_device_host_unavailable".to_string())?;
        // Tier 1: name + exact index.
        if let Some(device) =
            find_input_device_by_name_and_index(&target_host, &device_name, Some(index))
        {
            return Ok(device);
        }
        // Tier 2: same host, same name, any index. Handles index drift
        // — Marcel's reported case: interface is still plugged in,
        // name matches, but cpal reshuffled indices.
        if let Some(device) = find_input_device_by_name_and_index(&target_host, &device_name, None)
        {
            return Ok(device);
        }
        return Err("audio_input_device_not_found".to_string());
    }
    Err("audio_input_device_not_found".to_string())
}

/// Linear-scan a host's input devices for a match by name (and optional
/// exact index). Returns `None` when enumeration fails or nothing matches.
fn find_input_device_by_name_and_index(
    host: &cpal::Host,
    device_name: &str,
    index: Option<usize>,
) -> Option<cpal::Device> {
    let devices = host.input_devices().ok()?;
    for (device_index, device) in devices.enumerate() {
        let name_matches = device
            .name()
            .map(|name| name == device_name)
            .unwrap_or(false);
        if !name_matches {
            continue;
        }
        match index {
            Some(expected) if device_index != expected => continue,
            _ => return Some(device),
        }
    }
    None
}
