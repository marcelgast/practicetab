mod api;
mod commands;
mod devices;
mod engine;
mod input;
mod metronome;
mod metronome_samples;
mod pitch;
mod song;
mod song_stream;
mod synthesis;
mod synthesis_controller;
mod synthesis_metronome;
mod synthesis_midi;
mod synthesis_seek;
mod synthesis_vibrato;
mod types;

#[cfg(test)]
mod tests_devices;
#[cfg(test)]
mod tests_metronome;
#[cfg(test)]
mod tests_song;
#[cfg(test)]
mod tests_synthesis;
#[cfg(test)]
mod tests_synthesis_cc;
#[cfg(test)]
mod tests_synthesis_midi;
#[cfg(test)]
mod tests_types;

// Re-export public API used by lib.rs
pub use api::{
    audio_get_master_volume, audio_get_output_device, audio_list_output_devices,
    audio_refresh_output_devices, audio_seek, audio_seek_and_play, audio_set_master_volume,
    audio_set_output_device, audio_set_tab_volume, audio_song_clear_loop,
    audio_song_get_position_ms, audio_song_load, audio_song_pause, audio_song_play,
    audio_song_play_delayed, audio_song_seek, audio_song_set_loop, audio_song_set_speed,
    audio_song_set_tuning, audio_song_set_volume, audio_song_stop, audio_song_stretcher_latency_ms,
    audio_song_unload, audio_tab_clear_loop_range, audio_tab_get_position_ms, audio_tab_pause,
    audio_tab_play, audio_tab_prepare, audio_tab_schedule_events, audio_tab_seek,
    audio_tab_set_current_midi, audio_tab_set_loop_range, audio_tab_set_tempo_factor,
    audio_tab_set_track_state, audio_tab_set_tuning, audio_tab_stop, metronome_beep,
    metronome_cancel_scheduled, metronome_set_config, metronome_start, metronome_stop,
    metronome_tick_from_alphatab, seek_to_tick, AudioState,
};
pub use input::{
    audio_get_input_channel, audio_get_input_device, audio_get_input_status,
    audio_input_open_system_settings, audio_input_permission_status,
    audio_input_request_permission, audio_list_input_devices, audio_refresh_input_devices,
    audio_set_input_channel, audio_set_input_device, audio_start_input, audio_stop_input,
    AudioInputState,
};
pub use pitch::{
    audio_is_pitch_listening, audio_set_pitch_config, audio_start_pitch_detection,
    audio_stop_pitch_detection, AudioPitchState,
};
