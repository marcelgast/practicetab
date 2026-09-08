use chrono::{Local, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::path::resolve_db_path;

use super::repository::{
    ExerciseBpmHistoryEntry, ExerciseInterval, FeedbackRunInsert, IntervalModeSession,
    LibraryItemStatsEntry, PracticeExercise, PracticePlan, PracticeSession,
    PracticeSessionExercise, Repository,
};
use crate::error::AppError;
use tauri::AppHandle;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticePlanPayload {
    pub id: String,
    pub title: String,
    pub timed: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
    pub exercises: Vec<PracticeExercise>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveSessionPayload {
    pub session: PracticeSession,
    pub exercises: Vec<PracticeSessionExercise>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDetailPayload {
    pub session: PracticeSession,
    pub exercises: Vec<PracticeSessionExercise>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseTotalInput {
    pub exercise_id: String,
    pub total_time_spent_seconds: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePracticeStatsInput {
    pub sessions: Vec<PracticeSession>,
    pub session_exercises: Vec<PracticeSessionExercise>,
    pub exercise_totals: Vec<ExerciseTotalInput>,
    pub intervals_completed_total: i64,
    pub bpm_history: Option<Vec<ExerciseBpmHistoryEntry>>,
    pub library_item_stats: Option<Vec<LibraryItemStatsEntry>>,
    /// Live-Feedback runs from the backup. `None` when restoring a
    /// backup that pre-dates the feature (schema < v23) — the
    /// caller omits the field, no runs are inserted, and
    /// already-present feedback data on the target DB is untouched.
    /// Ids are assigned fresh on insert (AUTOINCREMENT) so restore
    /// is idempotent-ish when applied against an empty table and
    /// additive otherwise; the backup payload carries the insert
    /// shape (no id column) on purpose.
    pub feedback_runs: Option<Vec<FeedbackRunInsert>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntervalModeSessionInput {
    pub id: Option<String>,
    pub session_date: String,
    pub started_at: String,
    pub ended_at: String,
    pub timed_mode: bool,
    pub planned_total_seconds: Option<i64>,
    pub actual_run_seconds: i64,
    pub interval_duration_seconds: i64,
    pub intervals_completed: i64,
    pub start_bpm: i64,
    pub end_bpm: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseCreateInput {
    pub title: String,
    pub time_planned_minutes: Option<f64>,
    pub bpm: Option<i64>,
    pub notes: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseUpdateInput {
    pub title: Option<String>,
    pub time_planned_minutes: Option<Option<f64>>,
    pub bpm: Option<Option<i64>>,
    pub interval_auto: Option<bool>,
    pub interval_repeat: Option<bool>,
    pub notes: Option<Option<String>>,
    pub preferred_source: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntervalCreateInput {
    pub name: Option<String>,
    pub duration_seconds: i64,
    pub sort_index: i64,
    pub bpm: Option<i64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntervalUpdateInput {
    pub name: Option<Option<String>>,
    pub duration_seconds: Option<i64>,
    pub bpm: Option<Option<i64>>,
    pub done: Option<bool>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticePlanUpdateInput {
    pub title: Option<String>,
    pub timed: Option<bool>,
}

pub(crate) fn open_repo(app_handle: &AppHandle) -> Result<Repository, AppError> {
    let path = resolve_db_path(app_handle)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let repo = Repository::open(&path)?;
    repo.init()?;
    Ok(repo)
}

pub(crate) fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn today_key() -> String {
    Local::now().format("%Y-%m-%d").to_string()
}

fn to_plan_payload(plan: PracticePlan, exercises: Vec<PracticeExercise>) -> PracticePlanPayload {
    PracticePlanPayload {
        id: plan.id,
        title: plan.title,
        timed: plan.timed,
        sort_order: plan.sort_order,
        created_at: plan.created_at,
        updated_at: plan.updated_at,
        exercises,
    }
}

#[tauri::command]
pub fn list_practice_plans(app_handle: AppHandle) -> Result<Vec<PracticePlanPayload>, AppError> {
    let repo = open_repo(&app_handle)?;
    let plans = repo.list_plans()?;
    let mut payloads = Vec::new();
    for plan in plans {
        let exercises = repo.list_exercises_by_plan(&plan.id)?;
        payloads.push(to_plan_payload(plan, exercises));
    }
    Ok(payloads)
}

#[tauri::command]
pub fn create_practice_plan(
    app_handle: AppHandle,
    title: String,
    timed: Option<bool>,
) -> Result<PracticePlan, AppError> {
    let repo = open_repo(&app_handle)?;
    let sort_order = repo.list_plans()?.len() as i64;
    let now = now_iso();
    let plan = PracticePlan {
        id: Uuid::new_v4().to_string(),
        title,
        timed: timed.unwrap_or(false),
        sort_order,
        created_at: now.clone(),
        updated_at: now,
    };
    repo.upsert_plan(&plan)?;
    Ok(plan)
}

#[tauri::command]
pub fn rename_practice_plan(
    app_handle: AppHandle,
    plan_id: String,
    title: String,
) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    let mut plans = repo.list_plans()?;
    let Some(plan) = plans.iter_mut().find(|plan| plan.id == plan_id) else {
        return Err(AppError::NotFound("plan_not_found".to_string()));
    };
    plan.title = title;
    plan.updated_at = now_iso();
    repo.upsert_plan(plan)?;
    Ok(())
}

#[tauri::command]
pub fn update_practice_plan(
    app_handle: AppHandle,
    plan_id: String,
    input: PracticePlanUpdateInput,
) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    let mut plans = repo.list_plans()?;
    let Some(plan) = plans.iter_mut().find(|plan| plan.id == plan_id) else {
        return Err(AppError::NotFound("plan_not_found".to_string()));
    };
    if let Some(title) = input.title {
        plan.title = title;
    }
    if let Some(timed) = input.timed {
        plan.timed = timed;
    }
    plan.updated_at = now_iso();
    repo.upsert_plan(plan)?;
    Ok(())
}

#[tauri::command]
pub fn reorder_practice_plans(
    app_handle: AppHandle,
    ordered_plan_ids: Vec<String>,
) -> Result<(), AppError> {
    let mut repo = open_repo(&app_handle)?;
    repo.reorder_plans(&ordered_plan_ids)?;
    Ok(())
}

#[tauri::command]
pub fn delete_practice_plan(app_handle: AppHandle, plan_id: String) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    repo.delete_plan(&plan_id)?;
    Ok(())
}

#[tauri::command]
pub fn create_exercise(
    app_handle: AppHandle,
    plan_id: String,
    input: ExerciseCreateInput,
) -> Result<PracticeExercise, AppError> {
    let repo = open_repo(&app_handle)?;
    let sort_order = repo.list_exercises_by_plan(&plan_id)?.len() as i64;
    let now = now_iso();
    let exercise = PracticeExercise {
        id: Uuid::new_v4().to_string(),
        plan_id,
        title: input.title,
        sort_order,
        time_planned_minutes: input.time_planned_minutes,
        interval_auto: true,
        interval_repeat: false,
        linked_library_item_id: None,
        linked_audio_id: None,
        preferred_source: None,
        total_time_spent_seconds: 0,
        bpm: input.bpm,
        notes: input.notes,
        created_at: now.clone(),
        updated_at: now,
    };
    repo.upsert_exercise(&exercise)?;
    Ok(exercise)
}

#[tauri::command]
pub fn update_exercise(
    app_handle: AppHandle,
    exercise_id: String,
    input: ExerciseUpdateInput,
) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    let mut exercises = repo.list_exercises()?;
    let Some(exercise) = exercises.iter_mut().find(|entry| entry.id == exercise_id) else {
        return Err(AppError::NotFound("exercise_not_found".to_string()));
    };
    if let Some(title) = input.title {
        exercise.title = title;
    }
    if let Some(minutes) = input.time_planned_minutes {
        exercise.time_planned_minutes = minutes;
    }
    if let Some(bpm) = input.bpm {
        exercise.bpm = bpm;
    }
    if let Some(interval_auto) = input.interval_auto {
        exercise.interval_auto = interval_auto;
    }
    if let Some(interval_repeat) = input.interval_repeat {
        exercise.interval_repeat = interval_repeat;
    }
    if let Some(notes) = input.notes {
        exercise.notes = notes;
    }
    if let Some(preferred_source) = input.preferred_source {
        exercise.preferred_source = Some(preferred_source);
    }
    exercise.updated_at = now_iso();
    repo.upsert_exercise(exercise)?;
    Ok(())
}

#[tauri::command]
pub fn delete_exercise(app_handle: AppHandle, exercise_id: String) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    repo.delete_exercise(&exercise_id)?;
    Ok(())
}

#[tauri::command]
pub fn reorder_exercises(
    app_handle: AppHandle,
    plan_id: String,
    ordered_exercise_ids: Vec<String>,
) -> Result<(), AppError> {
    let mut repo = open_repo(&app_handle)?;
    repo.reorder_exercises(&plan_id, &ordered_exercise_ids)?;
    Ok(())
}

#[tauri::command]
pub fn list_intervals(
    app_handle: AppHandle,
    exercise_id: String,
) -> Result<Vec<ExerciseInterval>, AppError> {
    let repo = open_repo(&app_handle)?;
    Ok(repo.list_intervals_by_exercise(&exercise_id)?)
}

#[tauri::command]
pub fn create_interval(
    app_handle: AppHandle,
    exercise_id: String,
    input: IntervalCreateInput,
) -> Result<ExerciseInterval, AppError> {
    let repo = open_repo(&app_handle)?;
    let interval = ExerciseInterval {
        id: Uuid::new_v4().to_string(),
        exercise_id,
        sort_index: input.sort_index,
        name: input.name,
        duration_seconds: input.duration_seconds,
        bpm: input.bpm,
        done: false,
        created_at: Some(Utc::now().timestamp_millis()),
    };
    repo.upsert_interval(&interval)?;
    Ok(interval)
}

#[tauri::command]
pub fn update_interval(
    app_handle: AppHandle,
    interval_id: String,
    input: IntervalUpdateInput,
) -> Result<ExerciseInterval, AppError> {
    let repo = open_repo(&app_handle)?;
    let Some(mut interval) = repo.get_interval(&interval_id)? else {
        return Err(AppError::NotFound("interval_not_found".to_string()));
    };
    if let Some(name) = input.name {
        interval.name = name;
    }
    if let Some(duration) = input.duration_seconds {
        interval.duration_seconds = duration;
    }
    if let Some(bpm) = input.bpm {
        interval.bpm = bpm;
    }
    if let Some(done) = input.done {
        interval.done = done;
    }
    repo.upsert_interval(&interval)?;
    Ok(interval)
}

#[tauri::command]
pub fn delete_interval(app_handle: AppHandle, interval_id: String) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    repo.delete_interval(&interval_id)?;
    Ok(())
}

#[tauri::command]
pub fn reorder_intervals(
    app_handle: AppHandle,
    exercise_id: String,
    ordered_ids: Vec<String>,
) -> Result<(), AppError> {
    let mut repo = open_repo(&app_handle)?;
    repo.reorder_intervals(&exercise_id, &ordered_ids)?;
    Ok(())
}

#[tauri::command]
pub fn clear_interval_done_flags(
    app_handle: AppHandle,
    exercise_id: String,
) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    repo.clear_interval_done_flags(&exercise_id)?;
    Ok(())
}

#[tauri::command]
pub fn get_intervals_completed_total(app_handle: AppHandle) -> Result<i64, AppError> {
    let repo = open_repo(&app_handle)?;
    Ok(repo.get_intervals_completed_total()?)
}

#[tauri::command]
pub fn increment_intervals_completed_total(
    app_handle: AppHandle,
    delta: i64,
) -> Result<i64, AppError> {
    if delta <= 0 {
        return Err(AppError::Validation("invalid_delta".to_string()));
    }
    let repo = open_repo(&app_handle)?;
    Ok(repo.increment_intervals_completed_total(delta)?)
}

#[tauri::command]
pub fn list_interval_mode_sessions(
    app_handle: AppHandle,
    from: Option<String>,
    to: Option<String>,
) -> Result<Vec<IntervalModeSession>, AppError> {
    let repo = open_repo(&app_handle)?;
    Ok(repo.list_interval_mode_sessions(from.as_deref(), to.as_deref())?)
}

#[tauri::command]
pub fn record_interval_mode_session(
    app_handle: AppHandle,
    input: IntervalModeSessionInput,
) -> Result<IntervalModeSession, AppError> {
    let repo = open_repo(&app_handle)?;
    let session = IntervalModeSession {
        id: input.id.unwrap_or_else(|| Uuid::new_v4().to_string()),
        session_date: input.session_date,
        started_at: input.started_at,
        ended_at: input.ended_at,
        timed_mode: input.timed_mode,
        planned_total_seconds: input.planned_total_seconds,
        actual_run_seconds: input.actual_run_seconds.max(0),
        interval_duration_seconds: input.interval_duration_seconds.max(1),
        intervals_completed: input.intervals_completed.max(0),
        start_bpm: input.start_bpm.max(20),
        end_bpm: input.end_bpm.max(20),
    };
    repo.insert_interval_mode_session(&session)?;
    Ok(session)
}

#[tauri::command]
pub fn restore_practice_stats(
    app_handle: AppHandle,
    input: RestorePracticeStatsInput,
) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    for session in input.sessions {
        repo.insert_session(&session)?;
    }
    for entry in input.session_exercises {
        repo.insert_session_exercise(&entry)?;
    }
    for entry in input.exercise_totals {
        repo.set_exercise_total_time(&entry.exercise_id, entry.total_time_spent_seconds)?;
    }
    repo.set_intervals_completed_total(input.intervals_completed_total)?;
    if let Some(bpm_entries) = input.bpm_history {
        for entry in &bpm_entries {
            repo.insert_bpm_history(entry)?;
        }
    }
    if let Some(stats_entries) = input.library_item_stats {
        for entry in &stats_entries {
            repo.insert_library_item_stats(entry)?;
        }
    }
    if let Some(feedback_runs) = input.feedback_runs {
        for run in &feedback_runs {
            repo.insert_feedback_run(run)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn link_exercise_to_library_item(
    app_handle: AppHandle,
    exercise_id: String,
    library_item_id: String,
) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    let mut exercises = repo.list_exercises()?;
    let Some(exercise) = exercises.iter_mut().find(|entry| entry.id == exercise_id) else {
        return Err(AppError::NotFound("exercise_not_found".to_string()));
    };
    exercise.linked_library_item_id = Some(library_item_id);
    exercise.updated_at = now_iso();
    repo.upsert_exercise(exercise)?;
    Ok(())
}

#[tauri::command]
pub fn unlink_exercise_from_library_item(
    app_handle: AppHandle,
    exercise_id: String,
    kind: Option<String>,
) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    let mut exercises = repo.list_exercises()?;
    let Some(exercise) = exercises.iter_mut().find(|entry| entry.id == exercise_id) else {
        return Err(AppError::NotFound("exercise_not_found".to_string()));
    };
    match kind.as_deref() {
        Some("tab") => exercise.linked_library_item_id = None,
        Some("audio") => exercise.linked_audio_id = None,
        _ => {
            exercise.linked_library_item_id = None;
            exercise.linked_audio_id = None;
        }
    }
    exercise.updated_at = now_iso();
    repo.upsert_exercise(exercise)?;
    Ok(())
}

#[tauri::command]
pub fn link_exercise_to_audio(
    app_handle: AppHandle,
    exercise_id: String,
    audio_id: String,
) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    let mut exercises = repo.list_exercises()?;
    let Some(exercise) = exercises.iter_mut().find(|entry| entry.id == exercise_id) else {
        return Err(AppError::NotFound("exercise_not_found".to_string()));
    };
    exercise.linked_audio_id = Some(audio_id);
    exercise.updated_at = now_iso();
    repo.upsert_exercise(exercise)?;
    Ok(())
}

#[tauri::command]
pub fn start_session_if_needed(app_handle: AppHandle) -> Result<PracticeSession, AppError> {
    let repo = open_repo(&app_handle)?;
    let today = today_key();
    if let Some(active) = repo.get_active_session()? {
        if active.session_date == today {
            return Ok(active);
        }
        if active.ended_at.is_some() {
            return Ok(active);
        }
        let now = now_iso();
        repo.set_session_end(&active.id, &now)?;
    }

    let now = now_iso();
    let session = PracticeSession {
        id: Uuid::new_v4().to_string(),
        session_date: today,
        started_at: now.clone(),
        ended_at: None,
        total_time_spent_seconds: 0,
        total_playback_seconds: 0,
        // Journal columns start NULL — the TS goal dialog writes
        // them after the session is persisted.
        goal_text: None,
        review_text: None,
        goal_percent: None,
        goal_reached: None,
        created_at: now,
    };
    repo.insert_session(&session)?;
    Ok(session)
}

#[tauri::command]
pub fn end_active_session(app_handle: AppHandle) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    let Some(active) = repo.get_active_session()? else {
        return Ok(());
    };
    let now = now_iso();
    repo.set_session_end(&active.id, &now)?;
    Ok(())
}

#[tauri::command]
pub fn add_exercise_time(
    app_handle: AppHandle,
    exercise_id: String,
    delta_seconds: i64,
    playback_mode: Option<String>,
) -> Result<(), AppError> {
    let mut repo = open_repo(&app_handle)?;
    let session = start_session_if_needed(app_handle)?;
    let now = now_iso();
    repo.add_exercise_time(
        &session.id,
        &exercise_id,
        delta_seconds,
        &now,
        &Uuid::new_v4().to_string(),
        playback_mode.as_deref(),
    )?;
    Ok(())
}

#[tauri::command]
pub fn add_session_time(app_handle: AppHandle, delta_seconds: i64) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    let session = start_session_if_needed(app_handle)?;
    repo.add_session_time(&session.id, delta_seconds)?;
    Ok(())
}

#[tauri::command]
pub fn add_playback_time(
    app_handle: AppHandle,
    exercise_id: Option<String>,
    delta_seconds: i64,
) -> Result<(), AppError> {
    let mut repo = open_repo(&app_handle)?;
    let session = start_session_if_needed(app_handle)?;
    let now = now_iso();
    repo.add_playback_time(
        &session.id,
        exercise_id.as_deref(),
        delta_seconds,
        &now,
        &Uuid::new_v4().to_string(),
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Session Journal (PR 4.3)
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn update_session_goal(
    app_handle: AppHandle,
    session_id: String,
    goal_text: String,
) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    repo.update_session_goal(&session_id, &goal_text)?;
    Ok(())
}

#[tauri::command]
pub fn update_session_review(
    app_handle: AppHandle,
    session_id: String,
    review_text: Option<String>,
    goal_percent: Option<i64>,
    goal_reached: Option<bool>,
) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    repo.update_session_review(
        &session_id,
        review_text.as_deref(),
        goal_percent,
        goal_reached,
    )?;
    Ok(())
}

#[tauri::command]
pub fn clear_session_journal(app_handle: AppHandle, session_id: String) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    repo.clear_session_journal(&session_id)?;
    Ok(())
}

#[tauri::command]
pub fn list_sessions_with_journal(app_handle: AppHandle) -> Result<Vec<PracticeSession>, AppError> {
    let repo = open_repo(&app_handle)?;
    Ok(repo.list_sessions_with_journal()?)
}

#[tauri::command]
pub fn get_active_session(app_handle: AppHandle) -> Result<Option<ActiveSessionPayload>, AppError> {
    let repo = open_repo(&app_handle)?;
    let Some(active) = repo.get_active_session()? else {
        return Ok(None);
    };
    let entries = repo.list_session_exercises(&active.id)?;
    Ok(Some(ActiveSessionPayload {
        session: active,
        exercises: entries,
    }))
}

#[tauri::command]
pub fn list_sessions(
    app_handle: AppHandle,
    from: Option<String>,
    to: Option<String>,
) -> Result<Vec<PracticeSession>, AppError> {
    let repo = open_repo(&app_handle)?;
    Ok(repo.list_sessions(from.as_deref(), to.as_deref())?)
}

#[tauri::command]
pub fn get_session_detail(
    app_handle: AppHandle,
    session_id: String,
) -> Result<SessionDetailPayload, AppError> {
    let repo = open_repo(&app_handle)?;
    let sessions = repo.list_sessions(None, None)?;
    let Some(session) = sessions.into_iter().find(|entry| entry.id == session_id) else {
        return Err(AppError::NotFound("session_not_found".to_string()));
    };
    let entries = repo.list_session_exercises(&session.id)?;
    Ok(SessionDetailPayload {
        session,
        exercises: entries,
    })
}

#[tauri::command]
pub fn record_exercise_bpm(
    app_handle: AppHandle,
    exercise_id: String,
    bpm: i64,
) -> Result<ExerciseBpmHistoryEntry, AppError> {
    let repo = open_repo(&app_handle)?;
    let now = now_iso();
    let entry = ExerciseBpmHistoryEntry {
        id: Uuid::new_v4().to_string(),
        exercise_id,
        session_date: now[..10].to_string(),
        bpm,
        recorded_at: now,
    };
    repo.insert_bpm_history(&entry)?;
    Ok(entry)
}

#[tauri::command]
pub fn list_exercise_bpm_history(
    app_handle: AppHandle,
) -> Result<Vec<ExerciseBpmHistoryEntry>, AppError> {
    let repo = open_repo(&app_handle)?;
    Ok(repo.list_all_bpm_history()?)
}

#[tauri::command]
pub fn record_library_item_time(
    app_handle: AppHandle,
    library_item_id: String,
    delta_seconds: i64,
) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    let now = now_iso();
    repo.upsert_library_item_stats(&library_item_id, delta_seconds, false, false, &now)?;
    Ok(())
}

#[tauri::command]
pub fn increment_library_item_play_count(
    app_handle: AppHandle,
    library_item_id: String,
) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    let now = now_iso();
    repo.upsert_library_item_stats(&library_item_id, 0, true, false, &now)?;
    Ok(())
}

#[tauri::command]
pub fn increment_library_item_loop_count(
    app_handle: AppHandle,
    library_item_id: String,
) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    let now = now_iso();
    repo.upsert_library_item_stats(&library_item_id, 0, false, true, &now)?;
    Ok(())
}

#[tauri::command]
pub fn list_library_item_stats(
    app_handle: AppHandle,
) -> Result<Vec<LibraryItemStatsEntry>, AppError> {
    let repo = open_repo(&app_handle)?;
    Ok(repo.list_all_library_item_stats()?)
}

#[tauri::command]
pub fn reset_practice_db(app_handle: AppHandle) -> Result<(), AppError> {
    let repo = open_repo(&app_handle)?;
    repo.reset_practice_tables()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plan_payload_includes_exercises() {
        let plan = PracticePlan {
            id: "plan-1".to_string(),
            title: "Focus".to_string(),
            timed: false,
            sort_order: 0,
            created_at: "2025-01-01T00:00:00Z".to_string(),
            updated_at: "2025-01-01T00:00:00Z".to_string(),
        };
        let exercises = vec![PracticeExercise {
            id: "ex-1".to_string(),
            plan_id: "plan-1".to_string(),
            title: "Warmup".to_string(),
            time_planned_minutes: Some(10.0),
            interval_auto: true,
            interval_repeat: false,
            sort_order: 0,
            total_time_spent_seconds: 0,
            linked_library_item_id: None,
            linked_audio_id: None,
            preferred_source: None,
            bpm: None,
            notes: None,
            created_at: "2025-01-01T00:00:00Z".to_string(),
            updated_at: "2025-01-01T00:00:00Z".to_string(),
        }];

        let payload = to_plan_payload(plan, exercises.clone());
        assert_eq!(payload.exercises.len(), 1);
        assert_eq!(payload.exercises[0].title, exercises[0].title);
    }

    #[test]
    fn time_helpers_return_strings() {
        let iso = now_iso();
        let today = today_key();
        assert!(iso.contains("T"));
        assert_eq!(today.len(), 10);
    }
}
