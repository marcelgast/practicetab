// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod audio;
mod audio_decode;
mod backup;
mod dev_log;
pub mod error;
mod library_fs;
pub mod persistence;
mod window_state;

use audio::{
    audio_get_input_channel, audio_get_input_device, audio_get_input_status,
    audio_get_master_volume, audio_get_output_device, audio_input_open_system_settings,
    audio_input_permission_status, audio_input_request_permission, audio_is_pitch_listening,
    audio_list_input_devices, audio_list_output_devices, audio_refresh_input_devices,
    audio_refresh_output_devices, audio_seek, audio_seek_and_play, audio_set_input_channel,
    audio_set_input_device, audio_set_master_volume, audio_set_output_device,
    audio_set_pitch_config, audio_set_tab_volume, audio_song_clear_loop,
    audio_song_get_position_ms, audio_song_load, audio_song_pause, audio_song_play,
    audio_song_play_delayed, audio_song_seek, audio_song_set_loop, audio_song_set_speed,
    audio_song_set_tuning, audio_song_set_volume, audio_song_stop, audio_song_stretcher_latency_ms,
    audio_song_unload, audio_start_input, audio_start_pitch_detection, audio_stop_input,
    audio_stop_pitch_detection, audio_tab_clear_loop_range, audio_tab_get_position_ms,
    audio_tab_pause, audio_tab_play, audio_tab_prepare, audio_tab_schedule_events, audio_tab_seek,
    audio_tab_set_current_midi, audio_tab_set_loop_range, audio_tab_set_tempo_factor,
    audio_tab_set_track_state, audio_tab_set_tuning, audio_tab_stop, metronome_beep,
    metronome_cancel_scheduled, metronome_set_config, metronome_start, metronome_stop,
    metronome_tick_from_alphatab, seek_to_tick, AudioInputState, AudioPitchState, AudioState,
};
use audio_decode::commands::audio_decode_waveform;
use backup::{
    backup_pick_folder, backup_pick_open_file, backup_pick_save_file, backup_read_file_base64,
    backup_write_embedded_files, backup_write_file_base64, share_pick_open_file,
    share_pick_save_file, share_pick_tab_save_file,
};
use dev_log::dev_get_log_path;
use persistence::commands::{
    add_exercise_time, add_playback_time, add_session_time, clear_interval_done_flags,
    clear_session_journal, create_exercise, create_interval, create_practice_plan, delete_exercise,
    delete_interval, delete_practice_plan, end_active_session, get_active_session,
    get_intervals_completed_total, get_session_detail, increment_intervals_completed_total,
    increment_library_item_loop_count, increment_library_item_play_count, link_exercise_to_audio,
    link_exercise_to_library_item, list_exercise_bpm_history, list_interval_mode_sessions,
    list_intervals, list_library_item_stats, list_practice_plans, list_sessions,
    list_sessions_with_journal, record_exercise_bpm, record_interval_mode_session,
    record_library_item_time, rename_practice_plan, reorder_exercises, reorder_intervals,
    reorder_practice_plans, reset_practice_db, restore_practice_stats, start_session_if_needed,
    unlink_exercise_from_library_item, update_exercise, update_interval, update_practice_plan,
    update_session_goal, update_session_review,
};
use persistence::feedback_commands::{
    delete_feedback_run, get_feedback_run_details, list_feedback_runs,
    list_feedback_runs_for_exercise, list_feedback_runs_for_library_item,
    list_feedback_runs_with_details, record_feedback_run,
};
use persistence::library_commands::{
    library_delete, library_list, library_pick_audio_files, library_pick_gp_files,
    library_read_file_base64, library_stat, library_upsert, song_map_delete, song_map_get,
    song_map_save, waveform_compute_and_store, waveform_delete_stored, waveform_get_stored,
    waveform_store,
};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::path::BaseDirectory;
use tauri::{Emitter, LogicalSize, Manager};

/// Set by the frontend via `confirm_close` once pending timer data has been
/// flushed to SQLite. The window close handler then lets the close event
/// proceed without another flush round-trip. A 2s safety-net timer falls
/// back to `exit(0)` if the frontend fails to respond.
static CLOSE_CONFIRMED: AtomicBool = AtomicBool::new(false);

#[tauri::command]
fn confirm_close(window: tauri::Window) -> Result<(), AppError> {
    CLOSE_CONFIRMED.store(true, Ordering::Relaxed);
    let _ = window.close();
    Ok(())
}
use window_state::{load_window_state, logical_size_from_physical, save_window_state, WindowState};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

use error::AppError;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let soundfont = app
                .path()
                .resolve("resources/soundfonts/default.sf2", BaseDirectory::Resource)?;
            app.manage(AudioState::new(soundfont));
            let input_state = AudioInputState::new();
            let input_bridge = input_state.bridge();
            app.manage(input_state);
            app.manage(AudioPitchState::new(input_bridge, app.handle().clone()));
            if let Some(window) = app.get_webview_window("main") {
                let handle = app.handle();
                if let Some(state_path) = window_state::window_state_path(handle) {
                    if let Some(state) = load_window_state(&state_path) {
                        if state.fullscreen {
                            let _ = window.set_fullscreen(true);
                        } else {
                            if state.maximized {
                                let _ = window.maximize();
                            }
                            if !state.maximized && state.width > 0 && state.height > 0 {
                                let _ =
                                    window.set_size(LogicalSize::new(state.width, state.height));
                            }
                        }
                    }
                }
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if let Some(state_path) = window_state::window_state_path(window.app_handle()) {
                    let size = window.inner_size().ok();
                    let fullscreen = window.is_fullscreen().unwrap_or(false);
                    let maximized = window.is_maximized().unwrap_or(false);
                    if let Some(size) = size {
                        let scale = window.scale_factor().unwrap_or(1.0);
                        let logical = logical_size_from_physical(size, scale);
                        let state = WindowState {
                            width: logical.width,
                            height: logical.height,
                            fullscreen,
                            maximized,
                        };
                        let _ = save_window_state(&state_path, &state);
                    }
                }
                // Second close request (user clicked close again OR confirm_close
                // already ran window.close()): let it proceed.
                if CLOSE_CONFIRMED.load(Ordering::Relaxed) {
                    return;
                }
                // First close request: ask the frontend to flush any pending
                // timer seconds before we actually exit. Safety-net force-exit
                // fires after 2s so a broken listener can never leave the app
                // hung on shutdown.
                api.prevent_close();
                let _ = window.app_handle().emit("app-closing", ());
                let handle = window.app_handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    if !CLOSE_CONFIRMED.load(Ordering::Relaxed) {
                        CLOSE_CONFIRMED.store(true, Ordering::Relaxed);
                        handle.exit(0);
                    }
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            audio_list_output_devices,
            audio_refresh_output_devices,
            audio_get_output_device,
            audio_set_output_device,
            audio_list_input_devices,
            audio_refresh_input_devices,
            audio_get_input_device,
            audio_set_input_device,
            audio_get_input_channel,
            audio_set_input_channel,
            audio_start_input,
            audio_stop_input,
            audio_get_input_status,
            audio_input_permission_status,
            audio_input_request_permission,
            audio_input_open_system_settings,
            audio_start_pitch_detection,
            audio_stop_pitch_detection,
            audio_set_pitch_config,
            audio_is_pitch_listening,
            audio_set_master_volume,
            audio_set_tab_volume,
            audio_get_master_volume,
            audio_tab_prepare,
            audio_tab_schedule_events,
            audio_tab_play,
            audio_tab_pause,
            audio_tab_stop,
            audio_tab_seek,
            audio_seek,
            audio_seek_and_play,
            seek_to_tick,
            audio_tab_set_tempo_factor,
            audio_tab_set_track_state,
            audio_tab_set_loop_range,
            audio_tab_clear_loop_range,
            audio_tab_get_position_ms,
            audio_tab_set_tuning,
            audio_tab_set_current_midi,
            audio_song_load,
            audio_song_unload,
            audio_song_play,
            audio_song_play_delayed,
            audio_song_stretcher_latency_ms,
            audio_song_pause,
            audio_song_stop,
            audio_song_seek,
            audio_song_set_volume,
            audio_song_set_speed,
            audio_song_set_tuning,
            audio_song_set_loop,
            audio_song_clear_loop,
            audio_song_get_position_ms,
            metronome_start,
            metronome_stop,
            metronome_set_config,
            metronome_tick_from_alphatab,
            metronome_cancel_scheduled,
            metronome_beep,
            backup_pick_save_file,
            backup_pick_open_file,
            backup_pick_folder,
            backup_read_file_base64,
            backup_write_file_base64,
            backup_write_embedded_files,
            share_pick_save_file,
            share_pick_open_file,
            share_pick_tab_save_file,
            list_practice_plans,
            create_practice_plan,
            rename_practice_plan,
            update_practice_plan,
            reorder_practice_plans,
            delete_practice_plan,
            create_exercise,
            update_exercise,
            delete_exercise,
            reorder_exercises,
            list_intervals,
            create_interval,
            update_interval,
            delete_interval,
            reorder_intervals,
            clear_interval_done_flags,
            get_intervals_completed_total,
            increment_intervals_completed_total,
            list_interval_mode_sessions,
            record_interval_mode_session,
            record_feedback_run,
            list_feedback_runs,
            list_feedback_runs_for_exercise,
            list_feedback_runs_for_library_item,
            list_feedback_runs_with_details,
            get_feedback_run_details,
            delete_feedback_run,
            restore_practice_stats,
            record_exercise_bpm,
            list_exercise_bpm_history,
            link_exercise_to_library_item,
            link_exercise_to_audio,
            unlink_exercise_from_library_item,
            start_session_if_needed,
            end_active_session,
            add_exercise_time,
            add_session_time,
            add_playback_time,
            confirm_close,
            get_active_session,
            list_sessions,
            list_sessions_with_journal,
            update_session_goal,
            update_session_review,
            clear_session_journal,
            get_session_detail,
            reset_practice_db,
            record_library_item_time,
            increment_library_item_play_count,
            increment_library_item_loop_count,
            list_library_item_stats,
            library_list,
            library_upsert,
            library_delete,
            library_pick_gp_files,
            library_pick_audio_files,
            library_read_file_base64,
            library_stat,
            song_map_get,
            song_map_save,
            song_map_delete,
            dev_get_log_path,
            audio_decode_waveform,
            waveform_compute_and_store,
            waveform_get_stored,
            waveform_delete_stored,
            waveform_store,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::greet;

    #[test]
    fn greet_returns_message() {
        let message = greet("PracticeTab");
        assert!(message.contains("PracticeTab"));
    }
}
