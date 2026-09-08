//! Tauri commands for the Live-Feedback stats feature.
//!
//! Kept in its own module so the main `commands.rs` stays focused on
//! practice-plan / session / exercise orchestration. The commands
//! here are all thin wrappers around the matching `Repository`
//! methods — the real logic lives there so it's testable in-process
//! without going through the Tauri boundary.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::commands::{now_iso, open_repo};
use super::repository::{FeedbackRunDetails, FeedbackRunInsert, FeedbackRunOverview};
use crate::error::AppError;

/// Hard cap on the serialised note-result blob the frontend hands
/// over per run. A typical run is 100–300 KB; the limit leaves
/// generous headroom for marathon practice sessions while still
/// rejecting accidentally-unbounded payloads (frontend bug, malicious
/// import file, etc.) before they hit the SQLite blob path. 5 MB ≈
/// 50× the typical case and well below SQLite's `SQLITE_MAX_LENGTH`
/// default of 1 GB — so the cap is purely a defence-in-depth check
/// at the trust boundary.
const MAX_DETAILS_JSON_BYTES: usize = 5 * 1024 * 1024;

/// Payload the frontend hands over when a feedback run completes.
/// Accepts camelCase keys that match the TS-side `FeedbackSummary`
/// field names, with an optional `endedAt` override (defaults to
/// `now`) so batch-import / migration paths can set their own
/// timestamp if needed.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordFeedbackRunInput {
    pub session_id: Option<String>,
    pub exercise_id: Option<String>,
    pub library_item_id: String,
    pub ended_at: Option<String>,
    pub duration_seconds: i64,
    pub strictness_preset: String,
    pub total_notes: i64,
    pub hit_count: i64,
    pub missed_count: i64,
    pub extra_count: i64,
    pub pitch_perfect: i64,
    pub pitch_good: i64,
    pub pitch_acceptable: i64,
    pub pitch_wrong: i64,
    pub timing_perfect: i64,
    pub timing_good: i64,
    pub timing_acceptable: i64,
    pub timing_wrong: i64,
    pub longest_streak: i64,
    pub overall_score: i64,
    pub suggest_slow_down: bool,
    pub suggest_string_muting: bool,
    pub details_json: String,
}

#[tauri::command]
pub fn record_feedback_run(
    app_handle: AppHandle,
    input: RecordFeedbackRunInput,
) -> Result<i64, AppError> {
    if input.details_json.len() > MAX_DETAILS_JSON_BYTES {
        return Err(AppError::Validation(format!(
            "feedback_run_details_too_large: {} bytes exceeds {}",
            input.details_json.len(),
            MAX_DETAILS_JSON_BYTES
        )));
    }
    let repo = open_repo(&app_handle)?;
    let insert = FeedbackRunInsert {
        session_id: input.session_id,
        exercise_id: input.exercise_id,
        library_item_id: input.library_item_id,
        ended_at: input.ended_at.unwrap_or_else(now_iso),
        duration_seconds: input.duration_seconds,
        strictness_preset: input.strictness_preset,
        total_notes: input.total_notes,
        hit_count: input.hit_count,
        missed_count: input.missed_count,
        extra_count: input.extra_count,
        pitch_perfect: input.pitch_perfect,
        pitch_good: input.pitch_good,
        pitch_acceptable: input.pitch_acceptable,
        pitch_wrong: input.pitch_wrong,
        timing_perfect: input.timing_perfect,
        timing_good: input.timing_good,
        timing_acceptable: input.timing_acceptable,
        timing_wrong: input.timing_wrong,
        longest_streak: input.longest_streak,
        overall_score: input.overall_score,
        suggest_slow_down: input.suggest_slow_down,
        suggest_string_muting: input.suggest_string_muting,
        details_json: input.details_json,
    };
    let id = repo.insert_feedback_run(&insert)?;
    Ok(id)
}

#[tauri::command]
pub fn list_feedback_runs(
    app_handle: AppHandle,
    limit: Option<i64>,
) -> Result<Vec<FeedbackRunOverview>, AppError> {
    let repo = open_repo(&app_handle)?;
    Ok(repo.list_feedback_runs(limit)?)
}

#[tauri::command]
pub fn list_feedback_runs_for_exercise(
    app_handle: AppHandle,
    exercise_id: String,
    limit: Option<i64>,
) -> Result<Vec<FeedbackRunOverview>, AppError> {
    let repo = open_repo(&app_handle)?;
    Ok(repo.list_feedback_runs_for_exercise(&exercise_id, limit)?)
}

#[tauri::command]
pub fn list_feedback_runs_for_library_item(
    app_handle: AppHandle,
    library_item_id: String,
    limit: Option<i64>,
) -> Result<Vec<FeedbackRunOverview>, AppError> {
    let repo = open_repo(&app_handle)?;
    Ok(repo.list_feedback_runs_for_library_item(&library_item_id, limit)?)
}

#[tauri::command]
pub fn get_feedback_run_details(
    app_handle: AppHandle,
    id: i64,
) -> Result<Option<FeedbackRunDetails>, AppError> {
    let repo = open_repo(&app_handle)?;
    Ok(repo.get_feedback_run_details(id)?)
}

#[tauri::command]
pub fn delete_feedback_run(app_handle: AppHandle, id: i64) -> Result<bool, AppError> {
    let repo = open_repo(&app_handle)?;
    Ok(repo.delete_feedback_run(id)?)
}

/// Full-list export for backup. Returns every feedback run with
/// its `details_json` blob — expensive compared to
/// `list_feedback_runs`, so the UI never calls this; only the
/// backup export path does.
#[tauri::command]
pub fn list_feedback_runs_with_details(
    app_handle: AppHandle,
) -> Result<Vec<FeedbackRunDetails>, AppError> {
    let repo = open_repo(&app_handle)?;
    Ok(repo.list_feedback_runs_with_details()?)
}
