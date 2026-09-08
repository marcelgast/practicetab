use rusqlite::{params, Connection, OptionalExtension, Result, Row};
use serde::{Deserialize, Serialize};

use super::schema;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticePlan {
    pub id: String,
    pub title: String,
    pub timed: bool,
    pub sort_order: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeExercise {
    pub id: String,
    pub plan_id: String,
    pub title: String,
    pub sort_order: i64,
    pub time_planned_minutes: Option<f64>,
    pub interval_auto: bool,
    pub interval_repeat: bool,
    #[serde(rename = "linkedTabId")]
    pub linked_library_item_id: Option<String>,
    pub linked_audio_id: Option<String>,
    pub preferred_source: Option<String>,
    pub total_time_spent_seconds: i64,
    pub bpm: Option<i64>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseInterval {
    pub id: String,
    pub exercise_id: String,
    pub sort_index: i64,
    pub name: Option<String>,
    pub duration_seconds: i64,
    pub bpm: Option<i64>,
    pub done: bool,
    pub created_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeSession {
    pub id: String,
    pub session_date: String,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub total_time_spent_seconds: i64,
    #[serde(default)]
    pub total_playback_seconds: i64,
    pub created_at: String,
    // Session Journal (PR 4.3). All four nullable — absent means
    // the user hasn't filled the journal for this session yet. The
    // Stats "Session Journal" list filters rows with any of these
    // set so pre-v24 sessions stay invisible.
    #[serde(default)]
    pub goal_text: Option<String>,
    #[serde(default)]
    pub review_text: Option<String>,
    #[serde(default)]
    pub goal_percent: Option<i64>,
    #[serde(default)]
    pub goal_reached: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeSessionExercise {
    pub id: String,
    pub session_id: String,
    pub exercise_id: String,
    pub time_spent_seconds: i64,
    #[serde(default)]
    pub playback_time_seconds: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IntervalModeSession {
    pub id: String,
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

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExerciseBpmHistoryEntry {
    pub id: String,
    pub exercise_id: String,
    pub session_date: String,
    pub bpm: i64,
    pub recorded_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LibraryItem {
    pub id: String,
    pub title: String,
    pub source_kind: String,
    pub source_path: String,
    pub original_path: Option<String>,
    pub file_name: String,
    pub size: i64,
    pub modified_ms: i64,
    pub created_at: String,
    pub updated_at: String,
    pub last_known_ok: bool,
    pub missing_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongMap {
    pub library_item_id: String,
    pub start_offset_ms: f64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SongSection {
    pub id: String,
    pub library_item_id: String,
    pub label: String,
    pub color: String,
    pub timestamp_ms: f64,
    pub sort_order: i64,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct WaveformPeaksRow {
    pub library_item_id: String,
    pub peaks: Vec<u8>,
    pub duration_ms: f64,
    pub sample_rate: u32,
    pub created_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItemStatsEntry {
    pub library_item_id: String,
    pub play_count: i64,
    pub total_time_seconds: i64,
    pub loop_count: i64,
    pub last_played_at: Option<String>,
}

/// Payload the frontend hands over at the end of a Live-Feedback run.
/// `details_json` is already serialized client-side so the Rust layer
/// is opaque to the per-note shape — keeps the boundary flexible if
/// the `NoteResult` type grows new fields later.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackRunInsert {
    pub session_id: Option<String>,
    pub exercise_id: Option<String>,
    pub library_item_id: String,
    pub ended_at: String,
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

/// Lightweight row returned by the list queries — the per-note
/// details_json blob is intentionally omitted so listing 100+ runs
/// in the UI doesn't pull megabytes over the IPC boundary.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackRunOverview {
    pub id: i64,
    pub session_id: Option<String>,
    pub exercise_id: Option<String>,
    pub library_item_id: String,
    pub ended_at: String,
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
}

/// Overview row + the heavyweight details_json blob. Only fetched
/// when the user actually opens a run's detail view.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FeedbackRunDetails {
    #[serde(flatten)]
    pub overview: FeedbackRunOverview,
    pub details_json: String,
}

pub struct Repository {
    conn: Connection,
}

impl Repository {
    pub fn new(conn: Connection) -> Self {
        Self { conn }
    }

    pub fn open(path: &std::path::Path) -> Result<Self> {
        let conn = Connection::open(path)?;
        Ok(Self::new(conn))
    }

    pub fn init(&self) -> Result<()> {
        schema::init_db(&self.conn)
    }

    pub fn reset_practice_tables(&self) -> Result<()> {
        schema::reset_practice_tables(&self.conn)
    }

    pub fn get_intervals_completed_total(&self) -> Result<i64> {
        let total: Option<i64> = self
            .conn
            .query_row(
                "SELECT value FROM practice_stats WHERE key = ?1",
                ["intervals_completed_total"],
                |row| row.get(0),
            )
            .optional()?;
        Ok(total.unwrap_or(0))
    }

    pub fn increment_intervals_completed_total(&self, delta: i64) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO practice_stats (key, value) VALUES (?1, ?2)\n        ON CONFLICT(key) DO UPDATE SET value = value + excluded.value",
            params!["intervals_completed_total", delta],
        )?;
        self.get_intervals_completed_total()
    }

    pub fn set_intervals_completed_total(&self, total: i64) -> Result<()> {
        self.conn.execute(
            "INSERT INTO practice_stats (key, value) VALUES (?1, ?2)\n        ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params!["intervals_completed_total", total],
        )?;
        Ok(())
    }

    pub fn list_interval_mode_sessions(
        &self,
        from: Option<&str>,
        to: Option<&str>,
    ) -> Result<Vec<IntervalModeSession>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_date, started_at, ended_at, timed_mode, planned_total_seconds, actual_run_seconds, interval_duration_seconds, intervals_completed, start_bpm, end_bpm\n        FROM interval_mode_sessions\n        WHERE (?1 IS NULL OR session_date >= ?1)\n          AND (?2 IS NULL OR session_date <= ?2)\n        ORDER BY started_at ASC",
        )?;
        let rows = stmt.query_map(params![from, to], map_interval_mode_session)?;
        let mut sessions = Vec::new();
        for row in rows {
            sessions.push(row?);
        }
        Ok(sessions)
    }

    pub fn insert_interval_mode_session(&self, session: &IntervalModeSession) -> Result<()> {
        self.conn.execute(
            "INSERT INTO interval_mode_sessions (id, session_date, started_at, ended_at, timed_mode, planned_total_seconds, actual_run_seconds, interval_duration_seconds, intervals_completed, start_bpm, end_bpm)\n        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                session.id,
                session.session_date,
                session.started_at,
                session.ended_at,
                if session.timed_mode { 1 } else { 0 },
                session.planned_total_seconds,
                session.actual_run_seconds,
                session.interval_duration_seconds,
                session.intervals_completed,
                session.start_bpm,
                session.end_bpm,
            ],
        )?;
        Ok(())
    }

    pub fn upsert_plan(&self, plan: &PracticePlan) -> Result<()> {
        self.conn.execute(
            "INSERT INTO practice_plans (id, title, timed, sort_order, created_at, updated_at)\n        VALUES (?1, ?2, ?3, ?4, ?5, ?6)\n        ON CONFLICT(id) DO UPDATE SET\n          title = excluded.title,\n          timed = excluded.timed,\n          sort_order = excluded.sort_order,\n          updated_at = excluded.updated_at",
            params![
                plan.id,
                plan.title,
                if plan.timed { 1 } else { 0 },
                plan.sort_order,
                plan.created_at,
                plan.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn list_plans(&self) -> Result<Vec<PracticePlan>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, timed, sort_order, created_at, updated_at\n        FROM practice_plans\n        ORDER BY sort_order, created_at",
        )?;

        let rows = stmt.query_map([], map_plan)?;
        let mut plans = Vec::new();
        for row in rows {
            plans.push(row?);
        }
        Ok(plans)
    }

    pub fn delete_plan(&self, plan_id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM practice_plans WHERE id = ?1", [plan_id])?;
        Ok(())
    }

    pub fn reorder_plans(&mut self, ordered_ids: &[String]) -> Result<()> {
        let tx = self.conn.transaction()?;
        for (index, plan_id) in ordered_ids.iter().enumerate() {
            tx.execute(
                "UPDATE practice_plans SET sort_order = ?1 WHERE id = ?2",
                params![index as i64, plan_id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn upsert_exercise(&self, exercise: &PracticeExercise) -> Result<()> {
        self.conn.execute(
            "INSERT INTO practice_exercises (id, plan_id, title, sort_order, time_planned_minutes, interval_auto, interval_repeat, linked_library_item_id, linked_audio_id, preferred_source, total_time_spent_seconds, bpm, notes, created_at, updated_at)\n        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)\n        ON CONFLICT(id) DO UPDATE SET\n          plan_id = excluded.plan_id,\n          title = excluded.title,\n          sort_order = excluded.sort_order,\n          time_planned_minutes = excluded.time_planned_minutes,\n          interval_auto = excluded.interval_auto,\n          interval_repeat = excluded.interval_repeat,\n          linked_library_item_id = excluded.linked_library_item_id,\n          linked_audio_id = excluded.linked_audio_id,\n          preferred_source = excluded.preferred_source,\n          total_time_spent_seconds = excluded.total_time_spent_seconds,\n          bpm = excluded.bpm,\n          notes = excluded.notes,\n          updated_at = excluded.updated_at",
            params![
                exercise.id,
                exercise.plan_id,
                exercise.title,
                exercise.sort_order,
                exercise.time_planned_minutes,
                if exercise.interval_auto { 1 } else { 0 },
                if exercise.interval_repeat { 1 } else { 0 },
                exercise.linked_library_item_id,
                exercise.linked_audio_id,
                exercise.preferred_source,
                exercise.total_time_spent_seconds,
                exercise.bpm,
                exercise.notes,
                exercise.created_at,
                exercise.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn list_exercises_by_plan(&self, plan_id: &str) -> Result<Vec<PracticeExercise>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, plan_id, title, sort_order, time_planned_minutes, interval_auto, interval_repeat, linked_library_item_id, linked_audio_id, preferred_source, total_time_spent_seconds, bpm, notes, created_at, updated_at\n        FROM practice_exercises\n        WHERE plan_id = ?1\n        ORDER BY sort_order, created_at",
        )?;

        let rows = stmt.query_map([plan_id], map_exercise)?;
        let mut exercises = Vec::new();
        for row in rows {
            exercises.push(row?);
        }
        Ok(exercises)
    }

    pub fn list_exercises(&self) -> Result<Vec<PracticeExercise>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, plan_id, title, sort_order, time_planned_minutes, interval_auto, interval_repeat, linked_library_item_id, linked_audio_id, preferred_source, total_time_spent_seconds, bpm, notes, created_at, updated_at\n        FROM practice_exercises\n        ORDER BY sort_order, created_at",
        )?;

        let rows = stmt.query_map([], map_exercise)?;
        let mut exercises = Vec::new();
        for row in rows {
            exercises.push(row?);
        }
        Ok(exercises)
    }

    pub fn delete_exercise(&self, exercise_id: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM practice_exercises WHERE id = ?1",
            [exercise_id],
        )?;
        Ok(())
    }

    pub fn reorder_exercises(&mut self, plan_id: &str, ordered_ids: &[String]) -> Result<()> {
        let tx = self.conn.transaction()?;
        for (index, exercise_id) in ordered_ids.iter().enumerate() {
            tx.execute(
                "UPDATE practice_exercises SET sort_order = ?1 WHERE id = ?2 AND plan_id = ?3",
                params![index as i64, exercise_id, plan_id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn upsert_interval(&self, interval: &ExerciseInterval) -> Result<()> {
        self.conn.execute(
            "INSERT INTO exercise_intervals (id, exercise_id, sort_index, name, duration_seconds, bpm, done, created_at)\n        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)\n        ON CONFLICT(id) DO UPDATE SET\n          exercise_id = excluded.exercise_id,\n          sort_index = excluded.sort_index,\n          name = excluded.name,\n          duration_seconds = excluded.duration_seconds,\n          bpm = excluded.bpm,\n          done = excluded.done,\n          created_at = excluded.created_at",
            params![
                interval.id,
                interval.exercise_id,
                interval.sort_index,
                interval.name,
                interval.duration_seconds,
                interval.bpm,
                if interval.done { 1 } else { 0 },
                interval.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_interval(&self, interval_id: &str) -> Result<Option<ExerciseInterval>> {
        self.conn
            .query_row(
                "SELECT id, exercise_id, sort_index, name, duration_seconds, bpm, done, created_at\n        FROM exercise_intervals\n        WHERE id = ?1",
                [interval_id],
                map_interval,
            )
            .optional()
    }

    pub fn list_intervals_by_exercise(&self, exercise_id: &str) -> Result<Vec<ExerciseInterval>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, exercise_id, sort_index, name, duration_seconds, bpm, done, created_at\n        FROM exercise_intervals\n        WHERE exercise_id = ?1\n        ORDER BY sort_index, created_at",
        )?;

        let rows = stmt.query_map([exercise_id], map_interval)?;
        let mut intervals = Vec::new();
        for row in rows {
            intervals.push(row?);
        }
        Ok(intervals)
    }

    pub fn delete_interval(&self, interval_id: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM exercise_intervals WHERE id = ?1",
            [interval_id],
        )?;
        Ok(())
    }

    pub fn reorder_intervals(&mut self, exercise_id: &str, ordered_ids: &[String]) -> Result<()> {
        let tx = self.conn.transaction()?;
        for (index, interval_id) in ordered_ids.iter().enumerate() {
            tx.execute(
                "UPDATE exercise_intervals SET sort_index = ?1 WHERE id = ?2 AND exercise_id = ?3",
                params![index as i64, interval_id, exercise_id],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn clear_interval_done_flags(&self, exercise_id: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE exercise_intervals SET done = 0 WHERE exercise_id = ?1",
            [exercise_id],
        )?;
        Ok(())
    }

    pub fn insert_session(&self, session: &PracticeSession) -> Result<()> {
        self.conn.execute(
            "INSERT INTO practice_sessions (id, session_date, started_at, ended_at, total_time_spent_seconds, total_playback_seconds, goal_text, review_text, goal_percent, goal_reached, created_at)\n        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                session.id,
                session.session_date,
                session.started_at,
                session.ended_at,
                session.total_time_spent_seconds,
                session.total_playback_seconds,
                session.goal_text,
                session.review_text,
                session.goal_percent,
                session.goal_reached.map(i64::from),
                session.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn set_session_end(&self, session_id: &str, ended_at: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE practice_sessions SET ended_at = ?1 WHERE id = ?2",
            params![ended_at, session_id],
        )?;
        Ok(())
    }

    pub fn get_active_session(&self) -> Result<Option<PracticeSession>> {
        self.conn
            .query_row(
                "SELECT id, session_date, started_at, ended_at, total_time_spent_seconds, total_playback_seconds, goal_text, review_text, goal_percent, goal_reached, created_at\n        FROM practice_sessions\n        WHERE ended_at IS NULL\n        ORDER BY created_at DESC\n        LIMIT 1",
                [],
                map_session,
            )
            .optional()
    }

    pub fn list_sessions(
        &self,
        from: Option<&str>,
        to: Option<&str>,
    ) -> Result<Vec<PracticeSession>> {
        let base = "SELECT id, session_date, started_at, ended_at, total_time_spent_seconds, total_playback_seconds, goal_text, review_text, goal_percent, goal_reached, created_at FROM practice_sessions";
        let mut conditions: Vec<String> = Vec::new();
        let mut param_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(from) = from {
            conditions.push(format!("session_date >= ?{}", param_values.len() + 1));
            param_values.push(Box::new(from.to_string()));
        }
        if let Some(to) = to {
            conditions.push(format!("session_date <= ?{}", param_values.len() + 1));
            param_values.push(Box::new(to.to_string()));
        }

        let sql = if conditions.is_empty() {
            format!("{base} ORDER BY session_date")
        } else {
            format!(
                "{base} WHERE {} ORDER BY session_date",
                conditions.join(" AND ")
            )
        };

        let params: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|p| p.as_ref()).collect();
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt.query_map(params.as_slice(), map_session)?;
        rows.collect()
    }

    /// Set / overwrite the goal text for a session. Called from the
    /// session-start dialog; also callable from a retroactive edit
    /// path later if we add one. NULLing the goal is intentionally
    /// via `clear_session_journal`, not this setter — this one is
    /// about the happy path of writing a value.
    pub fn update_session_goal(&self, session_id: &str, goal_text: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE practice_sessions SET goal_text = ?1 WHERE id = ?2",
            params![goal_text, session_id],
        )?;
        Ok(())
    }

    /// Write the post-session review block in one shot. The overlay
    /// always saves all three fields together (review text, percent,
    /// reached flag) so there's no partial-update path to worry about.
    /// `goal_percent` is clamped at the caller; we accept whatever it
    /// passes so the DB doesn't silently rewrite historical rows that
    /// predated the clamp bound.
    pub fn update_session_review(
        &self,
        session_id: &str,
        review_text: Option<&str>,
        goal_percent: Option<i64>,
        goal_reached: Option<bool>,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE practice_sessions SET review_text = ?1, goal_percent = ?2, goal_reached = ?3 WHERE id = ?4",
            params![
                review_text,
                goal_percent,
                goal_reached.map(i64::from),
                session_id,
            ],
        )?;
        Ok(())
    }

    /// Wipe the four journal columns on a session back to NULL. Used
    /// by the Stats "delete journal entry" button — the session row
    /// and its accumulated time stay intact, only the journal is
    /// cleared. Safe to call on the active session.
    pub fn clear_session_journal(&self, session_id: &str) -> Result<()> {
        self.conn.execute(
            "UPDATE practice_sessions SET goal_text = NULL, review_text = NULL, goal_percent = NULL, goal_reached = NULL WHERE id = ?1",
            params![session_id],
        )?;
        Ok(())
    }

    /// Sessions that carry any journal content, newest-first. Powers
    /// the Stats list. Empty rows (no goal/review/percent/reached)
    /// stay out even if the session itself logged time — the list is
    /// about the journal, not the timer.
    pub fn list_sessions_with_journal(&self) -> Result<Vec<PracticeSession>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_date, started_at, ended_at, total_time_spent_seconds, total_playback_seconds, goal_text, review_text, goal_percent, goal_reached, created_at\n        FROM practice_sessions\n        WHERE goal_text IS NOT NULL\n           OR review_text IS NOT NULL\n           OR goal_percent IS NOT NULL\n           OR goal_reached IS NOT NULL\n        ORDER BY started_at DESC",
        )?;
        let rows = stmt.query_map([], map_session)?;
        rows.collect()
    }

    pub fn list_session_exercises(&self, session_id: &str) -> Result<Vec<PracticeSessionExercise>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, exercise_id, time_spent_seconds, playback_time_seconds, created_at\n        FROM practice_session_exercises\n        WHERE session_id = ?1\n        ORDER BY created_at",
        )?;

        let rows = stmt.query_map([session_id], map_session_exercise)?;
        let mut entries = Vec::new();
        for row in rows {
            entries.push(row?);
        }
        Ok(entries)
    }

    /// Record time an exercise was actively selected (expanded). Session-total
    /// is NOT incremented here — the global/session timer owns that column so
    /// selection and session time are tracked independently and can be
    /// compared (see `add_session_time`).
    pub fn add_exercise_time(
        &mut self,
        session_id: &str,
        exercise_id: &str,
        delta_seconds: i64,
        now: &str,
        new_row_id: &str,
        playback_mode: Option<&str>,
    ) -> Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute(
            "INSERT INTO practice_session_exercises (id, session_id, exercise_id, time_spent_seconds, playback_mode, created_at)\n        VALUES (?1, ?2, ?3, ?4, ?5, ?6)\n        ON CONFLICT(session_id, exercise_id) DO UPDATE SET\n          time_spent_seconds = time_spent_seconds + excluded.time_spent_seconds,\n          playback_mode = COALESCE(excluded.playback_mode, playback_mode)",
            params![
                new_row_id,
                session_id,
                exercise_id,
                delta_seconds,
                playback_mode,
                now,
            ],
        )?;
        tx.execute(
            "UPDATE practice_exercises SET total_time_spent_seconds = total_time_spent_seconds + ?1, updated_at = ?2 WHERE id = ?3",
            params![delta_seconds, now, exercise_id],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Increment the global session timer (single source of truth for
    /// `practice_sessions.total_time_spent_seconds`).
    pub fn add_session_time(&self, session_id: &str, delta_seconds: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE practice_sessions SET total_time_spent_seconds = total_time_spent_seconds + ?1 WHERE id = ?2",
            params![delta_seconds, session_id],
        )?;
        Ok(())
    }

    /// Record actual playback (tab/audio/metronome) time. Routed to a
    /// per-exercise bucket when an exercise is expanded, otherwise accrued
    /// on the session itself.
    pub fn add_playback_time(
        &mut self,
        session_id: &str,
        exercise_id: Option<&str>,
        delta_seconds: i64,
        now: &str,
        new_row_id: &str,
    ) -> Result<()> {
        let tx = self.conn.transaction()?;
        tx.execute(
            "UPDATE practice_sessions SET total_playback_seconds = total_playback_seconds + ?1 WHERE id = ?2",
            params![delta_seconds, session_id],
        )?;
        if let Some(exercise_id) = exercise_id {
            tx.execute(
                "INSERT INTO practice_session_exercises (id, session_id, exercise_id, time_spent_seconds, playback_time_seconds, created_at)\n        VALUES (?1, ?2, ?3, 0, ?4, ?5)\n        ON CONFLICT(session_id, exercise_id) DO UPDATE SET\n          playback_time_seconds = playback_time_seconds + excluded.playback_time_seconds",
                params![
                    new_row_id,
                    session_id,
                    exercise_id,
                    delta_seconds,
                    now,
                ],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn insert_session_exercise(&self, entry: &PracticeSessionExercise) -> Result<()> {
        self.conn.execute(
            "INSERT INTO practice_session_exercises (id, session_id, exercise_id, time_spent_seconds, playback_time_seconds, created_at)\n        VALUES (?1, ?2, ?3, ?4, ?5, ?6)\n        ON CONFLICT(session_id, exercise_id) DO UPDATE SET\n          time_spent_seconds = excluded.time_spent_seconds,\n          playback_time_seconds = excluded.playback_time_seconds,\n          created_at = excluded.created_at",
            params![
                entry.id,
                entry.session_id,
                entry.exercise_id,
                entry.time_spent_seconds,
                entry.playback_time_seconds,
                entry.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn set_exercise_total_time(
        &self,
        exercise_id: &str,
        total_time_spent_seconds: i64,
    ) -> Result<()> {
        self.conn.execute(
            "UPDATE practice_exercises SET total_time_spent_seconds = ?1 WHERE id = ?2",
            params![total_time_spent_seconds, exercise_id],
        )?;
        Ok(())
    }

    pub fn list_library_items(&self) -> Result<Vec<LibraryItem>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, title, source_kind, source_path, original_path, file_name, size, modified_ms, created_at, updated_at, last_known_ok, missing_reason\n        FROM library_items\n        ORDER BY created_at",
        )?;

        let rows = stmt.query_map([], map_library_item)?;
        let mut items = Vec::new();
        for row in rows {
            items.push(row?);
        }
        Ok(items)
    }

    pub fn upsert_library_item(&self, item: &LibraryItem) -> Result<()> {
        let last_known_ok = if item.last_known_ok { 1 } else { 0 };
        self.conn.execute(
            "INSERT INTO library_items (id, title, source_kind, source_path, original_path, file_name, size, modified_ms, created_at, updated_at, last_known_ok, missing_reason)\n        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)\n        ON CONFLICT(id) DO UPDATE SET\n          title = excluded.title,\n          source_kind = excluded.source_kind,\n          source_path = excluded.source_path,\n          original_path = excluded.original_path,\n          file_name = excluded.file_name,\n          size = excluded.size,\n          modified_ms = excluded.modified_ms,\n          updated_at = excluded.updated_at,\n          last_known_ok = excluded.last_known_ok,\n          missing_reason = excluded.missing_reason",
            params![
                item.id,
                item.title,
                item.source_kind,
                item.source_path,
                item.original_path,
                item.file_name,
                item.size,
                item.modified_ms,
                item.created_at,
                item.updated_at,
                last_known_ok,
                item.missing_reason,
            ],
        )?;
        Ok(())
    }

    pub fn delete_library_item(&self, item_id: &str) -> Result<()> {
        let _ = self.delete_song_map(item_id);
        let _ = self.delete_waveform_peaks(item_id);
        self.conn
            .execute("DELETE FROM library_items WHERE id = ?1", [item_id])?;
        Ok(())
    }

    pub fn get_song_map(&self, library_item_id: &str) -> Result<Option<SongMap>> {
        self.conn
            .query_row(
                "SELECT library_item_id, start_offset_ms, created_at, updated_at \
        FROM song_maps \
        WHERE library_item_id = ?1",
                [library_item_id],
                map_song_map,
            )
            .optional()
    }

    pub fn upsert_song_map(&self, map: &SongMap) -> Result<()> {
        self.conn.execute(
            "INSERT INTO song_maps (library_item_id, start_offset_ms, created_at, updated_at) \
        VALUES (?1, ?2, ?3, ?4) \
        ON CONFLICT(library_item_id) DO UPDATE SET \
          start_offset_ms = excluded.start_offset_ms, \
          updated_at = excluded.updated_at",
            params![
                map.library_item_id,
                map.start_offset_ms,
                map.created_at,
                map.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_song_map(&self, library_item_id: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM song_maps WHERE library_item_id = ?1",
            [library_item_id],
        )?;
        Ok(())
    }

    pub fn get_waveform_peaks(&self, library_item_id: &str) -> Result<Option<WaveformPeaksRow>> {
        self.conn
            .query_row(
                "SELECT library_item_id, peaks, duration_ms, sample_rate, created_at \
        FROM waveform_peaks \
        WHERE library_item_id = ?1",
                [library_item_id],
                |row| {
                    Ok(WaveformPeaksRow {
                        library_item_id: row.get(0)?,
                        peaks: row.get(1)?,
                        duration_ms: row.get(2)?,
                        sample_rate: row.get::<_, i64>(3)? as u32,
                        created_at: row.get(4)?,
                    })
                },
            )
            .optional()
    }

    pub fn upsert_waveform_peaks(&self, row: &WaveformPeaksRow) -> Result<()> {
        self.conn.execute(
            "INSERT INTO waveform_peaks (library_item_id, peaks, duration_ms, sample_rate, created_at) \
        VALUES (?1, ?2, ?3, ?4, ?5) \
        ON CONFLICT(library_item_id) DO UPDATE SET \
          peaks = excluded.peaks, \
          duration_ms = excluded.duration_ms, \
          sample_rate = excluded.sample_rate, \
          created_at = excluded.created_at",
            params![
                row.library_item_id,
                row.peaks,
                row.duration_ms,
                row.sample_rate as i64,
                row.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_waveform_peaks(&self, library_item_id: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM waveform_peaks WHERE library_item_id = ?1",
            [library_item_id],
        )?;
        Ok(())
    }

    pub fn list_song_sections(&self, library_item_id: &str) -> Result<Vec<SongSection>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, library_item_id, label, color, timestamp_ms, sort_order, created_at \
        FROM song_sections \
        WHERE library_item_id = ?1 \
        ORDER BY sort_order, timestamp_ms",
        )?;

        let rows = stmt.query_map([library_item_id], map_song_section)?;
        let mut sections = Vec::new();
        for row in rows {
            sections.push(row?);
        }
        Ok(sections)
    }

    pub fn upsert_song_section(&self, section: &SongSection) -> Result<()> {
        self.conn.execute(
            "INSERT INTO song_sections (id, library_item_id, label, color, timestamp_ms, sort_order, created_at) \
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
        ON CONFLICT(id) DO UPDATE SET \
          library_item_id = excluded.library_item_id, \
          label = excluded.label, \
          color = excluded.color, \
          timestamp_ms = excluded.timestamp_ms, \
          sort_order = excluded.sort_order",
            params![
                section.id,
                section.library_item_id,
                section.label,
                section.color,
                section.timestamp_ms,
                section.sort_order,
                section.created_at,
            ],
        )?;
        Ok(())
    }

    pub fn delete_song_section(&self, section_id: &str) -> Result<()> {
        self.conn
            .execute("DELETE FROM song_sections WHERE id = ?1", [section_id])?;
        Ok(())
    }

    pub fn replace_song_sections(
        &self,
        library_item_id: &str,
        sections: &[SongSection],
    ) -> Result<()> {
        let tx = self.conn.unchecked_transaction()?;
        tx.execute(
            "DELETE FROM song_sections WHERE library_item_id = ?1",
            [library_item_id],
        )?;
        for section in sections {
            tx.execute(
                "INSERT INTO song_sections (id, library_item_id, label, color, timestamp_ms, sort_order, created_at) \
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    section.id,
                    section.library_item_id,
                    section.label,
                    section.color,
                    section.timestamp_ms,
                    section.sort_order,
                    section.created_at,
                ],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn insert_bpm_history(&self, entry: &ExerciseBpmHistoryEntry) -> Result<()> {
        self.conn.execute(
            "INSERT INTO exercise_bpm_history (id, exercise_id, session_date, bpm, recorded_at) \
            VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                entry.id,
                entry.exercise_id,
                entry.session_date,
                entry.bpm,
                entry.recorded_at,
            ],
        )?;
        Ok(())
    }

    pub fn list_all_bpm_history(&self) -> Result<Vec<ExerciseBpmHistoryEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, exercise_id, session_date, bpm, recorded_at \
            FROM exercise_bpm_history \
            ORDER BY session_date ASC, recorded_at ASC",
        )?;
        let rows = stmt.query_map([], map_bpm_history_entry)?;
        let mut entries = Vec::new();
        for row in rows {
            entries.push(row?);
        }
        Ok(entries)
    }

    pub fn list_bpm_history_by_exercise(
        &self,
        exercise_id: &str,
    ) -> Result<Vec<ExerciseBpmHistoryEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, exercise_id, session_date, bpm, recorded_at \
            FROM exercise_bpm_history \
            WHERE exercise_id = ?1 \
            ORDER BY session_date ASC, recorded_at ASC",
        )?;
        let rows = stmt.query_map([exercise_id], map_bpm_history_entry)?;
        let mut entries = Vec::new();
        for row in rows {
            entries.push(row?);
        }
        Ok(entries)
    }

    pub fn upsert_library_item_stats(
        &self,
        item_id: &str,
        delta_seconds: i64,
        increment_play: bool,
        increment_loop: bool,
        now: &str,
    ) -> Result<()> {
        let play_delta: i64 = if increment_play { 1 } else { 0 };
        let loop_delta: i64 = if increment_loop { 1 } else { 0 };
        self.conn.execute(
            "INSERT INTO library_item_stats (library_item_id, play_count, total_time_seconds, loop_count, last_played_at) \
            VALUES (?1, ?2, ?3, ?4, ?5) \
            ON CONFLICT(library_item_id) DO UPDATE SET \
              play_count = play_count + excluded.play_count, \
              total_time_seconds = total_time_seconds + excluded.total_time_seconds, \
              loop_count = loop_count + excluded.loop_count, \
              last_played_at = excluded.last_played_at",
            params![item_id, play_delta, delta_seconds, loop_delta, now],
        )?;
        Ok(())
    }

    pub fn list_all_library_item_stats(&self) -> Result<Vec<LibraryItemStatsEntry>> {
        let mut stmt = self.conn.prepare(
            "SELECT library_item_id, play_count, total_time_seconds, loop_count, last_played_at \
            FROM library_item_stats \
            ORDER BY library_item_id",
        )?;
        let rows = stmt.query_map([], map_library_item_stats)?;
        let mut entries = Vec::new();
        for row in rows {
            entries.push(row?);
        }
        Ok(entries)
    }

    pub fn insert_library_item_stats(&self, entry: &LibraryItemStatsEntry) -> Result<()> {
        self.conn.execute(
            "INSERT INTO library_item_stats (library_item_id, play_count, total_time_seconds, loop_count, last_played_at) \
            VALUES (?1, ?2, ?3, ?4, ?5) \
            ON CONFLICT(library_item_id) DO UPDATE SET \
              play_count = excluded.play_count, \
              total_time_seconds = excluded.total_time_seconds, \
              loop_count = excluded.loop_count, \
              last_played_at = excluded.last_played_at",
            params![
                entry.library_item_id,
                entry.play_count,
                entry.total_time_seconds,
                entry.loop_count,
                entry.last_played_at,
            ],
        )?;
        Ok(())
    }

    /// Persist a completed Live-Feedback run. Returns the assigned
    /// row id so the frontend can navigate straight to the detail
    /// view without a round-trip list query.
    pub fn insert_feedback_run(&self, run: &FeedbackRunInsert) -> Result<i64> {
        self.conn.execute(
            "INSERT INTO feedback_runs (\
                session_id, exercise_id, library_item_id, ended_at, duration_seconds, \
                strictness_preset, total_notes, hit_count, missed_count, extra_count, \
                pitch_perfect, pitch_good, pitch_acceptable, pitch_wrong, \
                timing_perfect, timing_good, timing_acceptable, timing_wrong, \
                longest_streak, overall_score, suggest_slow_down, suggest_string_muting, \
                details_json\
            ) VALUES (\
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, \
                ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23\
            )",
            params![
                run.session_id,
                run.exercise_id,
                run.library_item_id,
                run.ended_at,
                run.duration_seconds,
                run.strictness_preset,
                run.total_notes,
                run.hit_count,
                run.missed_count,
                run.extra_count,
                run.pitch_perfect,
                run.pitch_good,
                run.pitch_acceptable,
                run.pitch_wrong,
                run.timing_perfect,
                run.timing_good,
                run.timing_acceptable,
                run.timing_wrong,
                run.longest_streak,
                run.overall_score,
                i64::from(run.suggest_slow_down),
                i64::from(run.suggest_string_muting),
                run.details_json,
            ],
        )?;
        Ok(self.conn.last_insert_rowid())
    }

    /// List recent runs as lightweight overviews (no details_json).
    /// `limit` caps the result count; `None` = no cap.
    pub fn list_feedback_runs(&self, limit: Option<i64>) -> Result<Vec<FeedbackRunOverview>> {
        let sql = build_feedback_overview_sql(None, limit);
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt
            .query_map([], map_feedback_overview)?
            .collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn list_feedback_runs_for_exercise(
        &self,
        exercise_id: &str,
        limit: Option<i64>,
    ) -> Result<Vec<FeedbackRunOverview>> {
        let sql = build_feedback_overview_sql(Some("exercise_id = ?1"), limit);
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt
            .query_map(params![exercise_id], map_feedback_overview)?
            .collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    pub fn list_feedback_runs_for_library_item(
        &self,
        library_item_id: &str,
        limit: Option<i64>,
    ) -> Result<Vec<FeedbackRunOverview>> {
        let sql = build_feedback_overview_sql(Some("library_item_id = ?1"), limit);
        let mut stmt = self.conn.prepare(&sql)?;
        let rows = stmt
            .query_map(params![library_item_id], map_feedback_overview)?
            .collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }

    /// Full row including the per-note details_json. Called lazily
    /// when the user opens a run's detail view — never from list
    /// queries (see `list_feedback_runs*`).
    pub fn get_feedback_run_details(&self, id: i64) -> Result<Option<FeedbackRunDetails>> {
        self.conn
            .query_row(
                "SELECT id, session_id, exercise_id, library_item_id, ended_at, \
                    duration_seconds, strictness_preset, total_notes, hit_count, \
                    missed_count, extra_count, pitch_perfect, pitch_good, \
                    pitch_acceptable, pitch_wrong, timing_perfect, timing_good, \
                    timing_acceptable, timing_wrong, longest_streak, overall_score, \
                    suggest_slow_down, suggest_string_muting, details_json \
                 FROM feedback_runs WHERE id = ?1",
                params![id],
                |row| {
                    Ok(FeedbackRunDetails {
                        overview: FeedbackRunOverview {
                            id: row.get(0)?,
                            session_id: row.get(1)?,
                            exercise_id: row.get(2)?,
                            library_item_id: row.get(3)?,
                            ended_at: row.get(4)?,
                            duration_seconds: row.get(5)?,
                            strictness_preset: row.get(6)?,
                            total_notes: row.get(7)?,
                            hit_count: row.get(8)?,
                            missed_count: row.get(9)?,
                            extra_count: row.get(10)?,
                            pitch_perfect: row.get(11)?,
                            pitch_good: row.get(12)?,
                            pitch_acceptable: row.get(13)?,
                            pitch_wrong: row.get(14)?,
                            timing_perfect: row.get(15)?,
                            timing_good: row.get(16)?,
                            timing_acceptable: row.get(17)?,
                            timing_wrong: row.get(18)?,
                            longest_streak: row.get(19)?,
                            overall_score: row.get(20)?,
                            suggest_slow_down: row.get::<_, i64>(21)? != 0,
                            suggest_string_muting: row.get::<_, i64>(22)? != 0,
                        },
                        details_json: row.get(23)?,
                    })
                },
            )
            .optional()
    }

    pub fn delete_feedback_run(&self, id: i64) -> Result<bool> {
        let rows = self
            .conn
            .execute("DELETE FROM feedback_runs WHERE id = ?1", params![id])?;
        Ok(rows > 0)
    }

    /// Full-fat list of every feedback run, details_json included.
    /// Used by the backup export path where we need the whole table
    /// in one shot. The regular list_feedback_runs* queries
    /// intentionally omit the blob column to keep the UI list IPC
    /// payload small; this method is the escape hatch for round-trip
    /// export/restore.
    pub fn list_feedback_runs_with_details(&self) -> Result<Vec<FeedbackRunDetails>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, session_id, exercise_id, library_item_id, ended_at, \
                duration_seconds, strictness_preset, total_notes, hit_count, \
                missed_count, extra_count, pitch_perfect, pitch_good, \
                pitch_acceptable, pitch_wrong, timing_perfect, timing_good, \
                timing_acceptable, timing_wrong, longest_streak, overall_score, \
                suggest_slow_down, suggest_string_muting, details_json \
             FROM feedback_runs ORDER BY ended_at ASC, id ASC",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(FeedbackRunDetails {
                    overview: FeedbackRunOverview {
                        id: row.get(0)?,
                        session_id: row.get(1)?,
                        exercise_id: row.get(2)?,
                        library_item_id: row.get(3)?,
                        ended_at: row.get(4)?,
                        duration_seconds: row.get(5)?,
                        strictness_preset: row.get(6)?,
                        total_notes: row.get(7)?,
                        hit_count: row.get(8)?,
                        missed_count: row.get(9)?,
                        extra_count: row.get(10)?,
                        pitch_perfect: row.get(11)?,
                        pitch_good: row.get(12)?,
                        pitch_acceptable: row.get(13)?,
                        pitch_wrong: row.get(14)?,
                        timing_perfect: row.get(15)?,
                        timing_good: row.get(16)?,
                        timing_acceptable: row.get(17)?,
                        timing_wrong: row.get(18)?,
                        longest_streak: row.get(19)?,
                        overall_score: row.get(20)?,
                        suggest_slow_down: row.get::<_, i64>(21)? != 0,
                        suggest_string_muting: row.get::<_, i64>(22)? != 0,
                    },
                    details_json: row.get(23)?,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
        Ok(rows)
    }
}

/// Shared SQL builder for the three list_feedback_runs* queries.
/// Splits the WHERE clause and LIMIT to keep the SELECT body
/// identical across callers — any new column added below needs to
/// land here and in `map_feedback_overview` only.
fn build_feedback_overview_sql(where_clause: Option<&str>, limit: Option<i64>) -> String {
    let mut sql = String::from(
        "SELECT id, session_id, exercise_id, library_item_id, ended_at, \
         duration_seconds, strictness_preset, total_notes, hit_count, \
         missed_count, extra_count, pitch_perfect, pitch_good, \
         pitch_acceptable, pitch_wrong, timing_perfect, timing_good, \
         timing_acceptable, timing_wrong, longest_streak, overall_score, \
         suggest_slow_down, suggest_string_muting \
         FROM feedback_runs",
    );
    if let Some(clause) = where_clause {
        sql.push_str(" WHERE ");
        sql.push_str(clause);
    }
    sql.push_str(" ORDER BY ended_at DESC, id DESC");
    if let Some(n) = limit {
        sql.push_str(&format!(" LIMIT {n}"));
    }
    sql
}

fn map_feedback_overview(row: &Row<'_>) -> Result<FeedbackRunOverview> {
    Ok(FeedbackRunOverview {
        id: row.get(0)?,
        session_id: row.get(1)?,
        exercise_id: row.get(2)?,
        library_item_id: row.get(3)?,
        ended_at: row.get(4)?,
        duration_seconds: row.get(5)?,
        strictness_preset: row.get(6)?,
        total_notes: row.get(7)?,
        hit_count: row.get(8)?,
        missed_count: row.get(9)?,
        extra_count: row.get(10)?,
        pitch_perfect: row.get(11)?,
        pitch_good: row.get(12)?,
        pitch_acceptable: row.get(13)?,
        pitch_wrong: row.get(14)?,
        timing_perfect: row.get(15)?,
        timing_good: row.get(16)?,
        timing_acceptable: row.get(17)?,
        timing_wrong: row.get(18)?,
        longest_streak: row.get(19)?,
        overall_score: row.get(20)?,
        suggest_slow_down: row.get::<_, i64>(21)? != 0,
        suggest_string_muting: row.get::<_, i64>(22)? != 0,
    })
}

fn map_plan(row: &Row<'_>) -> Result<PracticePlan> {
    Ok(PracticePlan {
        id: row.get(0)?,
        title: row.get(1)?,
        timed: row.get::<_, i64>(2)? != 0,
        sort_order: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn map_exercise(row: &Row<'_>) -> Result<PracticeExercise> {
    Ok(PracticeExercise {
        id: row.get(0)?,
        plan_id: row.get(1)?,
        title: row.get(2)?,
        sort_order: row.get(3)?,
        time_planned_minutes: row.get(4)?,
        interval_auto: row.get::<_, i64>(5)? != 0,
        interval_repeat: row.get::<_, i64>(6)? != 0,
        linked_library_item_id: row.get(7)?,
        linked_audio_id: row.get(8)?,
        preferred_source: row.get(9)?,
        total_time_spent_seconds: row.get(10)?,
        bpm: row.get(11)?,
        notes: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

fn map_interval(row: &Row<'_>) -> Result<ExerciseInterval> {
    Ok(ExerciseInterval {
        id: row.get(0)?,
        exercise_id: row.get(1)?,
        sort_index: row.get(2)?,
        name: row.get(3)?,
        duration_seconds: row.get(4)?,
        bpm: row.get(5)?,
        done: row.get::<_, i64>(6)? != 0,
        created_at: row.get(7)?,
    })
}

fn map_session(row: &Row<'_>) -> Result<PracticeSession> {
    // Column order matches every session SELECT in this file:
    // core fields → journal block (goal_text, review_text,
    // goal_percent, goal_reached) → created_at trailing so new
    // callers only need to append to the SELECT without shifting
    // existing indices that reference id/started_at/etc.
    Ok(PracticeSession {
        id: row.get(0)?,
        session_date: row.get(1)?,
        started_at: row.get(2)?,
        ended_at: row.get(3)?,
        total_time_spent_seconds: row.get(4)?,
        total_playback_seconds: row.get(5)?,
        goal_text: row.get(6)?,
        review_text: row.get(7)?,
        goal_percent: row.get(8)?,
        goal_reached: row.get::<_, Option<i64>>(9)?.map(|v| v != 0),
        created_at: row.get(10)?,
    })
}

fn map_session_exercise(row: &Row<'_>) -> Result<PracticeSessionExercise> {
    Ok(PracticeSessionExercise {
        id: row.get(0)?,
        session_id: row.get(1)?,
        exercise_id: row.get(2)?,
        time_spent_seconds: row.get(3)?,
        playback_time_seconds: row.get(4)?,
        created_at: row.get(5)?,
    })
}

fn map_interval_mode_session(row: &Row<'_>) -> Result<IntervalModeSession> {
    Ok(IntervalModeSession {
        id: row.get(0)?,
        session_date: row.get(1)?,
        started_at: row.get(2)?,
        ended_at: row.get(3)?,
        timed_mode: row.get::<_, i64>(4)? != 0,
        planned_total_seconds: row.get(5)?,
        actual_run_seconds: row.get(6)?,
        interval_duration_seconds: row.get(7)?,
        intervals_completed: row.get(8)?,
        start_bpm: row.get(9)?,
        end_bpm: row.get(10)?,
    })
}

fn map_library_item(row: &Row<'_>) -> Result<LibraryItem> {
    let last_known_ok: i64 = row.get(10)?;
    Ok(LibraryItem {
        id: row.get(0)?,
        title: row.get(1)?,
        source_kind: row.get(2)?,
        source_path: row.get(3)?,
        original_path: row.get(4)?,
        file_name: row.get(5)?,
        size: row.get(6)?,
        modified_ms: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
        last_known_ok: last_known_ok != 0,
        missing_reason: row.get(11)?,
    })
}

fn map_song_map(row: &Row<'_>) -> Result<SongMap> {
    Ok(SongMap {
        library_item_id: row.get(0)?,
        start_offset_ms: row.get(1)?,
        created_at: row.get(2)?,
        updated_at: row.get(3)?,
    })
}

fn map_song_section(row: &Row<'_>) -> Result<SongSection> {
    Ok(SongSection {
        id: row.get(0)?,
        library_item_id: row.get(1)?,
        label: row.get(2)?,
        color: row.get(3)?,
        timestamp_ms: row.get(4)?,
        sort_order: row.get(5)?,
        created_at: row.get(6)?,
    })
}

fn map_bpm_history_entry(row: &Row<'_>) -> Result<ExerciseBpmHistoryEntry> {
    Ok(ExerciseBpmHistoryEntry {
        id: row.get(0)?,
        exercise_id: row.get(1)?,
        session_date: row.get(2)?,
        bpm: row.get(3)?,
        recorded_at: row.get(4)?,
    })
}

fn map_library_item_stats(row: &Row<'_>) -> Result<LibraryItemStatsEntry> {
    Ok(LibraryItemStatsEntry {
        library_item_id: row.get(0)?,
        play_count: row.get(1)?,
        total_time_seconds: row.get(2)?,
        loop_count: row.get(3)?,
        last_played_at: row.get(4)?,
    })
}

#[cfg(test)]
#[path = "tests_repository.rs"]
mod tests;
