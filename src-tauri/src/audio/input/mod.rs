mod api;
mod bridge;
mod commands;
mod devices;
mod engine;
mod permission;
mod ring;
mod types;

pub(crate) use bridge::AudioInputBridge;
pub(crate) use commands::AudioInputCommand;

#[cfg(test)]
mod tests_devices;
#[cfg(test)]
mod tests_engine;
#[cfg(test)]
mod tests_ring;

pub use api::{
    audio_get_input_channel, audio_get_input_device, audio_get_input_status,
    audio_input_open_system_settings, audio_input_permission_status,
    audio_input_request_permission, audio_list_input_devices, audio_refresh_input_devices,
    audio_set_input_channel, audio_set_input_device, audio_start_input, audio_stop_input,
    AudioInputState,
};
