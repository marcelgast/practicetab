mod analyzer;
mod api;
mod engine;
mod note;
mod types;

#[cfg(test)]
mod tests_analyzer;
#[cfg(test)]
mod tests_note;
#[cfg(test)]
mod tests_types;

pub use api::{
    audio_is_pitch_listening, audio_set_pitch_config, audio_start_pitch_detection,
    audio_stop_pitch_detection, AudioPitchState,
};
