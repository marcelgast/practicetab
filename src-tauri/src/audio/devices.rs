use cpal::traits::{DeviceTrait, HostTrait};

use super::types::OutputDevice;

pub(crate) fn host_id_string(host_id: cpal::HostId) -> String {
    format!("{host_id:?}")
}

pub(crate) fn select_output_host() -> cpal::Host {
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

pub(crate) fn list_devices_for_host(host: &cpal::Host) -> Vec<OutputDevice> {
    let host_id = host.id();
    let default_device = host.default_output_device();
    let default_name = default_device
        .as_ref()
        .and_then(|device| device.name().ok());
    let devices = host
        .output_devices()
        .map(|devices| devices.collect::<Vec<_>>())
        .unwrap_or_default();
    if devices.is_empty() {
        return default_device
            .into_iter()
            .map(|device| {
                let name = device.name().unwrap_or_else(|_| "Unknown Output".into());
                let id = device_id_for(&name, host_id, 0);
                OutputDevice {
                    id: id.clone(),
                    name: name.clone(),
                    is_default: default_name.as_ref() == Some(&name),
                }
            })
            .collect();
    }
    devices
        .into_iter()
        .enumerate()
        .map(|(index, device)| {
            let name = device.name().unwrap_or_else(|_| "Unknown Output".into());
            let id = device_id_for(&name, host_id, index);
            OutputDevice {
                id: id.clone(),
                name: name.clone(),
                is_default: default_name.as_ref() == Some(&name),
            }
        })
        .collect()
}

pub(crate) fn list_devices(host: &cpal::Host) -> Vec<OutputDevice> {
    let mut devices = list_devices_for_host(host);
    for host_id in cpal::available_hosts() {
        if host_id == host.id() {
            continue;
        }
        if let Ok(other_host) = cpal::host_from_id(host_id) {
            devices.extend(list_devices_for_host(&other_host));
        }
    }
    devices
}
