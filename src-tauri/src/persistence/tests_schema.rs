use super::*;
use rusqlite::{params, Connection};

#[test]
fn init_db_creates_schema_version() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    let version: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .unwrap();

    assert_eq!(version, SCHEMA_VERSION);
}

#[test]
fn practice_schema_v5_adds_timed_and_bpm() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    let timed_columns: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('practice_plans') WHERE name = 'timed'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(timed_columns, 1);

    let bpm_columns: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('practice_exercises') WHERE name = 'bpm'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(bpm_columns, 1);

    let not_null: i64 = conn
        .query_row(
            "SELECT \"notnull\" FROM pragma_table_info('practice_exercises') WHERE name = 'time_planned_minutes'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(not_null, 0);
}

#[test]
fn practice_schema_v11_allows_decimal_minutes() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    let col_type: String = conn
        .query_row(
            "SELECT \"type\" FROM pragma_table_info('practice_exercises') WHERE name = 'time_planned_minutes'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(col_type.to_uppercase(), "REAL");
}

#[test]
fn practice_schema_v6_adds_exercise_intervals() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    let interval_columns: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('exercise_intervals') WHERE name = 'duration_seconds'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(interval_columns, 1);
}

#[test]
fn practice_schema_v7_adds_interval_bpm() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    let bpm_columns: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('exercise_intervals') WHERE name = 'bpm'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(bpm_columns, 1);
}

#[test]
fn practice_schema_v8_adds_interval_auto_and_done_defaults() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    conn.execute(
        "INSERT INTO practice_plans (id, title, timed, sort_order, created_at, updated_at)\n        VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            "plan-1",
            "Plan",
            0,
            0,
            "2025-01-01T00:00:00Z",
            "2025-01-01T00:00:00Z",
        ],
    )
    .unwrap();

    conn.execute(
        "INSERT INTO practice_exercises (id, plan_id, title, sort_order, time_planned_minutes, linked_library_item_id, total_time_spent_seconds, bpm, created_at, updated_at)\n        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            "exercise-1",
            "plan-1",
            "Warmups",
            0,
            Option::<f64>::None,
            Option::<String>::None,
            0,
            Option::<i64>::None,
            "2025-01-01T00:00:00Z",
            "2025-01-01T00:00:00Z",
        ],
    )
    .unwrap();

    let interval_auto: i64 = conn
        .query_row(
            "SELECT interval_auto FROM practice_exercises WHERE id = ?1",
            ["exercise-1"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(interval_auto, 1);

    conn.execute(
        "INSERT INTO exercise_intervals (id, exercise_id, sort_index, name, duration_seconds, bpm, created_at)\n        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            "interval-1",
            "exercise-1",
            0,
            Option::<String>::None,
            60,
            Option::<i64>::None,
            Option::<i64>::None,
        ],
    )
    .unwrap();

    let done: i64 = conn
        .query_row(
            "SELECT done FROM exercise_intervals WHERE id = ?1",
            ["interval-1"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(done, 0);
}

#[test]
fn practice_schema_v9_adds_exercise_notes() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    let notes_columns: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('practice_exercises') WHERE name = 'notes'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(notes_columns, 1);
}

#[test]
fn practice_schema_v10_adds_practice_stats() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    let stats_columns: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('practice_stats') WHERE name = 'key'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(stats_columns, 1);

    let total: i64 = conn
        .query_row(
            "SELECT value FROM practice_stats WHERE key = ?1",
            ["intervals_completed_total"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(total, 0);
}

#[test]
fn practice_schema_v12_adds_interval_mode_sessions() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    let columns: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('interval_mode_sessions') WHERE name = 'session_date'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(columns, 1);
}

#[test]
fn schema_v15_creates_song_maps_and_sections() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    let song_maps_columns: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('song_maps') WHERE name = 'library_item_id'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(song_maps_columns, 1);

    let song_sections_columns: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('song_sections') WHERE name = 'timestamp_ms'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(song_sections_columns, 1);

    let index_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_song_sections_library'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(index_count, 1);
}

#[test]
fn schema_v16_creates_waveform_peaks() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    let peaks_columns: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('waveform_peaks') WHERE name = 'peaks'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(peaks_columns, 1);

    let duration_columns: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('waveform_peaks') WHERE name = 'duration_ms'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(duration_columns, 1);

    let sample_rate_columns: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM pragma_table_info('waveform_peaks') WHERE name = 'sample_rate'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(sample_rate_columns, 1);
}

#[test]
fn schema_v24_adds_session_journal_columns() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    for column in ["goal_text", "review_text", "goal_percent", "goal_reached"] {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('practice_sessions') WHERE name = ?1",
                [column],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "expected practice_sessions.{column}");

        let not_null: i64 = conn
            .query_row(
                "SELECT \"notnull\" FROM pragma_table_info('practice_sessions') WHERE name = ?1",
                [column],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(not_null, 0, "{column} must be nullable");
    }
}

#[test]
fn schema_v23_creates_feedback_runs_table() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    // Core columns present.
    for column in [
        "id",
        "session_id",
        "exercise_id",
        "library_item_id",
        "ended_at",
        "duration_seconds",
        "strictness_preset",
        "total_notes",
        "hit_count",
        "missed_count",
        "extra_count",
        "pitch_perfect",
        "pitch_good",
        "pitch_acceptable",
        "pitch_wrong",
        "timing_perfect",
        "timing_good",
        "timing_acceptable",
        "timing_wrong",
        "longest_streak",
        "overall_score",
        "suggest_slow_down",
        "suggest_string_muting",
        "details_json",
    ] {
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('feedback_runs') WHERE name = ?1",
                [column],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1, "expected feedback_runs.{column}");
    }

    // library_item_id must be NOT NULL (every tab has a library entry).
    let library_nullable: i64 = conn
        .query_row(
            "SELECT \"notnull\" FROM pragma_table_info('feedback_runs') WHERE name = 'library_item_id'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(library_nullable, 1);

    // The three query indexes we rely on are all in place.
    for index_name in [
        "idx_feedback_runs_ended_at",
        "idx_feedback_runs_exercise",
        "idx_feedback_runs_library",
    ] {
        let index_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'index' AND name = ?1",
                [index_name],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(index_count, 1, "expected index {index_name}");
    }
}

/// Foreign-key state at end of init_db must be ON. The pragma is
/// per-connection (not a database property) so this guarantees
/// every connection that runs `init_db` ends up enforcing the
/// schema's CASCADE clauses for subsequent writes.
#[test]
fn init_db_enables_foreign_keys_at_the_end() {
    let conn = Connection::open_in_memory().unwrap();
    init_db(&conn).unwrap();

    let foreign_keys_on: i32 = conn
        .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
        .unwrap();
    assert_eq!(
        foreign_keys_on, 1,
        "init_db must end with foreign_keys = ON",
    );
}

/// Regression for PR #64 follow-up finding. Several legacy
/// migrations (v5, v17) rebuild a parent table via the
/// "create new / copy / drop old / rename" pattern. If FK
/// enforcement were active during the upgrade, the DROP would
/// cascade-delete existing children referencing the old parent,
/// silently destroying user data on app upgrade.
///
/// This test reproduces the dangerous scenario: build a v4-era
/// database with a `practice_session_exercises`-style child row
/// that references a `practice_exercises` parent, then run the
/// full migration chain. The child row must survive intact.
#[test]
fn migrating_from_v4_preserves_practice_session_exercise_children() {
    let conn = Connection::open_in_memory().unwrap();

    // Hand-build a minimal v4 schema. Mirrors the relevant tables
    // from apply_v1..apply_v4 — only the parts needed to insert
    // the child row whose survival proves FK enforcement was OFF
    // during the v5 rebuild.
    conn.execute_batch(
        "CREATE TABLE schema_migrations (\
            version INTEGER PRIMARY KEY,\
            applied_at TEXT NOT NULL\
        );\
        CREATE TABLE practice_plans (\
            id TEXT PRIMARY KEY,\
            title TEXT NOT NULL,\
            sort_order INTEGER NOT NULL DEFAULT 0,\
            created_at TEXT NOT NULL,\
            updated_at TEXT NOT NULL\
        );\
        CREATE TABLE practice_exercises (\
            id TEXT PRIMARY KEY,\
            plan_id TEXT NOT NULL REFERENCES practice_plans(id) ON DELETE CASCADE,\
            title TEXT NOT NULL,\
            sort_order INTEGER NOT NULL DEFAULT 0,\
            time_planned_minutes INTEGER NULL,\
            linked_library_item_id TEXT NULL,\
            total_time_spent_seconds INTEGER NOT NULL DEFAULT 0,\
            created_at TEXT NOT NULL,\
            updated_at TEXT NOT NULL\
        );\
        CREATE TABLE practice_sessions (\
            id TEXT PRIMARY KEY,\
            session_date TEXT NOT NULL,\
            started_at TEXT NOT NULL,\
            ended_at TEXT NULL,\
            total_time_spent_seconds INTEGER NOT NULL DEFAULT 0,\
            created_at TEXT NOT NULL\
        );\
        CREATE TABLE practice_session_exercises (\
            session_id TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,\
            exercise_id TEXT NOT NULL REFERENCES practice_exercises(id) ON DELETE CASCADE,\
            time_spent_seconds INTEGER NOT NULL DEFAULT 0,\
            PRIMARY KEY (session_id, exercise_id)\
        );",
    )
    .unwrap();
    // Mark the DB as already at version 4 so init_db skips v1-v4
    // and starts the migration chain at v5 (the dangerous one).
    for v in 1..=4 {
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            params![v],
        )
        .unwrap();
    }

    // Insert a parent + child + session row. The child references
    // both parents via CASCADE — exactly the relationship that
    // would be broken if FK enforcement were on during v5's
    // `DROP TABLE practice_exercises`.
    conn.execute(
        "INSERT INTO practice_plans (id, title, sort_order, created_at, updated_at) \
         VALUES ('plan-1', 'Plan', 0, '2024-01-01', '2024-01-01')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO practice_exercises (id, plan_id, title, sort_order, total_time_spent_seconds, created_at, updated_at) \
         VALUES ('ex-1', 'plan-1', 'Exercise', 0, 0, '2024-01-01', '2024-01-01')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO practice_sessions (id, session_date, started_at, total_time_spent_seconds, created_at) \
         VALUES ('sess-1', '2024-01-01', '2024-01-01T00:00:00Z', 0, '2024-01-01')",
        [],
    )
    .unwrap();
    conn.execute(
        "INSERT INTO practice_session_exercises (session_id, exercise_id, time_spent_seconds) \
         VALUES ('sess-1', 'ex-1', 0)",
        [],
    )
    .unwrap();

    // Run the full migration chain. v5 will drop+rename the parent
    // table. With FKs ON during migration this would cascade-
    // delete the row in practice_session_exercises (verified
    // separately — DROP TABLE on the parent does fire CASCADE on
    // children when foreign_keys is enabled, despite the SQLite
    // docs implying otherwise).
    init_db(&conn).unwrap();

    let surviving_links: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM practice_session_exercises WHERE session_id = 'sess-1' AND exercise_id = 'ex-1'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(
        surviving_links, 1,
        "v5 migration must preserve practice_session_exercises rows; \
         a 0 here means FKs were enforced during the parent-table rebuild \
         and CASCADE dropped the link",
    );

    // And the post-migration connection should now have FKs ON.
    let foreign_keys_on: i32 = conn
        .query_row("PRAGMA foreign_keys", [], |row| row.get(0))
        .unwrap();
    assert_eq!(foreign_keys_on, 1);
}
