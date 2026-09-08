//! Pitch detection worker thread. Polls the shared `AudioInputBridge` for
//! fresh samples, runs the rolling `PitchAnalyzer`, and emits
//! `"pitch-detected"` Tauri events. Commands (Start/Stop/SetConfig) arrive
//! via an `mpsc::Sender` owned by the Tauri state.

use std::sync::mpsc::{Receiver, Sender};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};

use super::analyzer::PitchAnalyzer;
use super::types::{PitchConfig, PitchResult};
use crate::audio::input::AudioInputBridge;

/// Event name dispatched to the frontend for every analyzer tick.
pub(crate) const PITCH_EVENT: &str = "pitch-detected";

/// Poll cadence when the engine is running. 5 ms keeps latency low without
/// busy-spinning — at 44.1 kHz that is ~220 samples, well below one hop.
const POLL_INTERVAL: Duration = Duration::from_millis(5);
/// Upper bound on samples pulled per poll; matches two analysis windows to
/// avoid pathological build-up if the worker was paused.
const MAX_POP_SAMPLES: usize = 4096;

pub(crate) enum PitchCommand {
    Start,
    Stop,
    SetConfig(PitchConfig),
    IsListening(Sender<bool>),
}

pub(crate) fn spawn_pitch_worker(
    bridge: Arc<AudioInputBridge>,
    app: AppHandle,
    rx: Receiver<PitchCommand>,
) {
    std::thread::spawn(move || worker_loop(bridge, app, rx));
}

fn worker_loop(bridge: Arc<AudioInputBridge>, app: AppHandle, rx: Receiver<PitchCommand>) {
    let mut config = PitchConfig::default();
    let mut running = false;
    let mut analyzer: Option<PitchAnalyzer> = None;
    let mut scratch = vec![0.0_f32; MAX_POP_SAMPLES];
    let start_instant = Instant::now();

    loop {
        // Drain any pending commands non-blockingly when running, or block
        // waiting for the next command when idle.
        if running {
            while let Ok(cmd) = rx.try_recv() {
                handle_command(cmd, &mut running, &mut config, &mut analyzer);
            }
        } else {
            match rx.recv() {
                Ok(cmd) => {
                    handle_command(cmd, &mut running, &mut config, &mut analyzer);
                    continue;
                }
                Err(_) => return,
            }
        }

        // Running path: pull fresh samples, push through analyzer, emit.
        let sample_rate = bridge.sample_rate();
        if sample_rate == 0 {
            // Input isn't live yet — nothing to analyze.
            std::thread::sleep(POLL_INTERVAL);
            continue;
        }

        // Lazily (re)build the analyzer when the sample rate changes or on
        // first tick after start.
        let needs_rebuild = analyzer
            .as_ref()
            .map(|a| a.sample_rate() != sample_rate || a.config() != config)
            .unwrap_or(true);
        if needs_rebuild {
            analyzer = Some(PitchAnalyzer::new(
                config,
                sample_rate,
                start_instant.elapsed().as_secs_f64() * 1000.0,
            ));
        }

        let n = bridge.pop_slice(&mut scratch);
        if n == 0 {
            std::thread::sleep(POLL_INTERVAL);
            continue;
        }
        let now_ms = start_instant.elapsed().as_secs_f64() * 1000.0;
        if let Some(analyzer) = analyzer.as_mut() {
            if let Some(result) = analyzer.push_samples(&scratch[..n], now_ms) {
                emit_result(&app, &result);
            }
        }
    }
}

fn handle_command(
    cmd: PitchCommand,
    running: &mut bool,
    config: &mut PitchConfig,
    analyzer: &mut Option<PitchAnalyzer>,
) {
    match cmd {
        PitchCommand::Start => {
            *running = true;
            // Force analyzer rebuild on next tick so window state is fresh.
            *analyzer = None;
        }
        PitchCommand::Stop => {
            *running = false;
            *analyzer = None;
        }
        PitchCommand::SetConfig(new_config) => {
            *config = new_config;
            *analyzer = None;
        }
        PitchCommand::IsListening(reply) => {
            let _ = reply.send(*running);
        }
    }
}

fn emit_result(app: &AppHandle, result: &PitchResult) {
    // Keep silent per audio-architecture rule: no debug noise. Event emit
    // failure is not actionable from the worker thread.
    let _ = app.emit(PITCH_EVENT, result);
}
