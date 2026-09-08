use rusqlite::{Connection, Result};

pub const SCHEMA_VERSION: i32 = 24;

pub fn init_db(conn: &Connection) -> Result<()> {
    // Disable FK enforcement for the duration of the migration
    // chain. This is NOT just defensive: `libsqlite3-sys` is built
    // with `-DSQLITE_DEFAULT_FOREIGN_KEYS=1`, so every fresh
    // connection in this app starts with FKs already ON — and at
    // least one legacy migration (v5) uses the documented
    // "create new / copy / drop old / rename" pattern that
    // cascade-deletes children referencing the dropped parent
    // when FKs are enforced (verified via probing test, despite
    // SQLite's docs implying DROP TABLE is exempt from CASCADE).
    // v17 has the same shape around `song_maps`. Without this
    // toggle, upgrading a real user's DB across either of those
    // points silently wipes `practice_session_exercises` rows.
    //
    // The pragma must be set OUTSIDE any active transaction —
    // execute_batch on a single statement runs without one, so
    // putting it before the migration chain is fine. Re-enabled
    // below, after the chain settles.
    conn.execute_batch("PRAGMA foreign_keys = OFF;")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (\
      version INTEGER PRIMARY KEY,\
      applied_at TEXT NOT NULL\
    );",
    )?;

    let current: i32 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;

    if current < 1 {
        apply_v1(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [1],
        )?;
    }

    if current < 2 {
        apply_v2(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [2],
        )?;
    }

    if current < 3 {
        apply_v3(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [3],
        )?;
    }

    if current < 4 {
        apply_v4(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [4],
        )?;
    }

    if current < 5 {
        apply_v5(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [5],
        )?;
    }

    if current < 6 {
        apply_v6(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [6],
        )?;
    }

    if current < 7 {
        apply_v7(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [7],
        )?;
    }

    if current < 8 {
        apply_v8(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [8],
        )?;
    }

    if current < 9 {
        apply_v9(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [9],
        )?;
    }

    if current < 10 {
        apply_v10(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [10],
        )?;
    }

    if current < 11 {
        apply_v11(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [11],
        )?;
    }

    if current < 12 {
        apply_v12(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [12],
        )?;
    }

    if current < 13 {
        apply_v13(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [13],
        )?;
    }

    if current < 14 {
        apply_v14(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [14],
        )?;
    }

    if current < 15 {
        apply_v15(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [15],
        )?;
    }

    if current < 16 {
        apply_v16(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [16],
        )?;
    }

    if current < 17 {
        apply_v17(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [17],
        )?;
    }

    if current < 18 {
        apply_v18(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [18],
        )?;
    }

    if current < 19 {
        apply_v19(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [19],
        )?;
    }

    if current < 20 {
        apply_v20(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [20],
        )?;
    }

    if current < 21 {
        apply_v21(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [21],
        )?;
    }

    if current < 22 {
        apply_v22(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [22],
        )?;
    }

    if current < 23 {
        apply_v23(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [23],
        )?;
    }

    if current < 24 {
        apply_v24(conn)?;
        conn.execute(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?1, CURRENT_TIMESTAMP)",
            [24],
        )?;
    }

    ensure_exercise_intervals_table(conn)?;

    // Now safe to enable foreign-key enforcement: the schema is at
    // its current version and no further `DROP TABLE` of a parent
    // can race a CASCADE clause on an existing child. The pragma
    // is per-connection (not a database property), so it has to be
    // re-set on every open. SQLite does NOT validate existing rows
    // when this flips ON — stale dangling references from before
    // enforcement was enabled stay intact and surface lazily as
    // the offending parent rows get deleted (CASCADE will then
    // sweep them away as intended).
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;

    Ok(())
}

pub fn reset_practice_tables(conn: &Connection) -> Result<()> {
    recreate_practice_tables(conn)
}

fn apply_v1(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS plans (\
      id TEXT PRIMARY KEY,\
      name TEXT NOT NULL,\
      created_at TEXT NOT NULL,\
      updated_at TEXT NOT NULL\
    );\
    CREATE TABLE IF NOT EXISTS items (\
      id TEXT PRIMARY KEY,\
      plan_id TEXT NOT NULL,\
      title TEXT NOT NULL,\
      notes TEXT NULL,\
      created_at TEXT NOT NULL,\
      updated_at TEXT NOT NULL,\
      is_archived INTEGER NOT NULL\
    );\
    CREATE TABLE IF NOT EXISTS sessions (\
      id TEXT PRIMARY KEY,\
      item_id TEXT NOT NULL,\
      started_at TEXT NOT NULL,\
      ended_at TEXT NOT NULL,\
      duration_sec INTEGER NOT NULL,\
      note TEXT NULL\
    );\
    CREATE INDEX IF NOT EXISTS idx_items_plan_id ON items(plan_id);\
    CREATE INDEX IF NOT EXISTS idx_sessions_item_id ON sessions(item_id);",
    )
}

fn apply_v2(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS library_items (\
      id TEXT PRIMARY KEY,\
      title TEXT NOT NULL,\
      source_kind TEXT NOT NULL,\
      source_path TEXT NOT NULL,\
      original_path TEXT NULL,\
      file_name TEXT NOT NULL,\
      size INTEGER NOT NULL,\
      modified_ms INTEGER NOT NULL,\
      created_at TEXT NOT NULL,\
      updated_at TEXT NOT NULL,\
      last_known_ok INTEGER NOT NULL,\
      missing_reason TEXT NULL\
    );\
    CREATE INDEX IF NOT EXISTS idx_library_items_source_kind ON library_items(source_kind);",
    )
}

fn apply_v3(conn: &Connection) -> Result<()> {
    conn.execute_batch("ALTER TABLE items ADD COLUMN linked_library_item_id TEXT NULL;")
}

fn apply_v4(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "DROP TABLE IF EXISTS exercise_intervals;\
     DROP TABLE IF EXISTS practice_session_exercises;\
     DROP TABLE IF EXISTS practice_sessions;\
     DROP TABLE IF EXISTS practice_exercises;\
     DROP TABLE IF EXISTS practice_plans;\
     CREATE TABLE IF NOT EXISTS practice_plans (\
      id TEXT PRIMARY KEY,\
      title TEXT NOT NULL,\
      sort_order INTEGER NOT NULL DEFAULT 0,\
      created_at TEXT NOT NULL,\
      updated_at TEXT NOT NULL\
    );\
     CREATE TABLE IF NOT EXISTS practice_exercises (\
      id TEXT PRIMARY KEY,\
      plan_id TEXT NOT NULL REFERENCES practice_plans(id) ON DELETE CASCADE,\
      title TEXT NOT NULL,\
      sort_order INTEGER NOT NULL DEFAULT 0,\
      time_planned_minutes REAL NOT NULL DEFAULT 5,\
      linked_library_item_id TEXT NULL,\
      total_time_spent_seconds INTEGER NOT NULL DEFAULT 0,\
      created_at TEXT NOT NULL,\
      updated_at TEXT NOT NULL\
    );\
     CREATE TABLE IF NOT EXISTS practice_sessions (\
      id TEXT PRIMARY KEY,\
      session_date TEXT NOT NULL,\
      started_at TEXT NOT NULL,\
      ended_at TEXT NULL,\
      total_time_spent_seconds INTEGER NOT NULL DEFAULT 0,\
      created_at TEXT NOT NULL\
    );\
     CREATE TABLE IF NOT EXISTS practice_session_exercises (\
      id TEXT PRIMARY KEY,\
      session_id TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,\
      exercise_id TEXT NOT NULL REFERENCES practice_exercises(id) ON DELETE CASCADE,\
      time_spent_seconds INTEGER NOT NULL DEFAULT 0,\
      created_at TEXT NOT NULL,\
      UNIQUE(session_id, exercise_id)\
    );\
     CREATE INDEX IF NOT EXISTS idx_practice_exercises_plan_id ON practice_exercises(plan_id);\
     CREATE INDEX IF NOT EXISTS idx_practice_sessions_date ON practice_sessions(session_date);\
     CREATE INDEX IF NOT EXISTS idx_practice_session_exercises_session_id ON practice_session_exercises(session_id);\
     CREATE INDEX IF NOT EXISTS idx_practice_session_exercises_exercise_id ON practice_session_exercises(exercise_id);",
    )
}

fn apply_v5(conn: &Connection) -> Result<()> {
    conn.execute_batch("ALTER TABLE practice_plans ADD COLUMN timed INTEGER NOT NULL DEFAULT 0;")?;
    conn.execute_batch("ALTER TABLE practice_exercises ADD COLUMN bpm INTEGER NULL;")?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS practice_exercises_new (\
      id TEXT PRIMARY KEY,\
      plan_id TEXT NOT NULL REFERENCES practice_plans(id) ON DELETE CASCADE,\
      title TEXT NOT NULL,\
      sort_order INTEGER NOT NULL DEFAULT 0,\
      time_planned_minutes REAL NULL,\
      linked_library_item_id TEXT NULL,\
      total_time_spent_seconds INTEGER NOT NULL DEFAULT 0,\
      bpm INTEGER NULL,\
      created_at TEXT NOT NULL,\
      updated_at TEXT NOT NULL\
    );\
     INSERT INTO practice_exercises_new (\
      id, plan_id, title, sort_order, time_planned_minutes, linked_library_item_id,\
      total_time_spent_seconds, bpm, created_at, updated_at\
    ) SELECT id, plan_id, title, sort_order, time_planned_minutes, linked_library_item_id,\
      total_time_spent_seconds, bpm, created_at, updated_at FROM practice_exercises;\
     DROP TABLE practice_exercises;\
     ALTER TABLE practice_exercises_new RENAME TO practice_exercises;\
     CREATE INDEX IF NOT EXISTS idx_practice_exercises_plan_id ON practice_exercises(plan_id);",
    )?;
    Ok(())
}

fn apply_v6(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS exercise_intervals (\
      id TEXT PRIMARY KEY,\
      exercise_id TEXT NOT NULL REFERENCES practice_exercises(id) ON DELETE CASCADE,\
      sort_index INTEGER NOT NULL DEFAULT 0,\
      name TEXT NULL,\
      duration_seconds INTEGER NOT NULL,\
      bpm INTEGER NULL,\
      created_at INTEGER NULL\
    );\
     CREATE INDEX IF NOT EXISTS idx_exercise_intervals_exercise_id ON exercise_intervals(exercise_id);",
    )
}

fn apply_v7(conn: &Connection) -> Result<()> {
    let bpm_columns: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('exercise_intervals') WHERE name = 'bpm'",
        [],
        |row| row.get(0),
    )?;
    if bpm_columns == 0 {
        conn.execute_batch("ALTER TABLE exercise_intervals ADD COLUMN bpm INTEGER NULL;")?;
    }
    Ok(())
}

fn apply_v8(conn: &Connection) -> Result<()> {
    let interval_auto_columns: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('practice_exercises') WHERE name = 'interval_auto'",
        [],
        |row| row.get(0),
    )?;
    if interval_auto_columns == 0 {
        conn.execute_batch(
            "ALTER TABLE practice_exercises ADD COLUMN interval_auto INTEGER NOT NULL DEFAULT 1;",
        )?;
    }

    let done_columns: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('exercise_intervals') WHERE name = 'done'",
        [],
        |row| row.get(0),
    )?;
    if done_columns == 0 {
        conn.execute_batch(
            "ALTER TABLE exercise_intervals ADD COLUMN done INTEGER NOT NULL DEFAULT 0;",
        )?;
    }
    Ok(())
}

fn apply_v9(conn: &Connection) -> Result<()> {
    let notes_columns: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('practice_exercises') WHERE name = 'notes'",
        [],
        |row| row.get(0),
    )?;
    if notes_columns == 0 {
        conn.execute_batch("ALTER TABLE practice_exercises ADD COLUMN notes TEXT NULL;")?;
    }
    Ok(())
}

fn apply_v10(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS practice_stats (\
      key TEXT PRIMARY KEY,\
      value INTEGER NOT NULL DEFAULT 0\
    );",
    )?;
    conn.execute(
        "INSERT INTO practice_stats (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO NOTHING",
        ["intervals_completed_total", "0"],
    )?;
    Ok(())
}

fn apply_v11(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS practice_exercises_new (\
      id TEXT PRIMARY KEY,\
      plan_id TEXT NOT NULL REFERENCES practice_plans(id) ON DELETE CASCADE,\
      title TEXT NOT NULL,\
      sort_order INTEGER NOT NULL DEFAULT 0,\
      time_planned_minutes REAL NULL,\
      interval_auto INTEGER NOT NULL DEFAULT 1,\
      linked_library_item_id TEXT NULL,\
      total_time_spent_seconds INTEGER NOT NULL DEFAULT 0,\
      bpm INTEGER NULL,\
      notes TEXT NULL,\
      created_at TEXT NOT NULL,\
      updated_at TEXT NOT NULL\
    );\
     INSERT INTO practice_exercises_new (\
      id, plan_id, title, sort_order, time_planned_minutes, interval_auto, linked_library_item_id,\
      total_time_spent_seconds, bpm, notes, created_at, updated_at\
    ) SELECT id, plan_id, title, sort_order, CAST(time_planned_minutes AS REAL), interval_auto, linked_library_item_id,\
      total_time_spent_seconds, bpm, notes, created_at, updated_at FROM practice_exercises;\
     DROP TABLE practice_exercises;\
     ALTER TABLE practice_exercises_new RENAME TO practice_exercises;\
     CREATE INDEX IF NOT EXISTS idx_practice_exercises_plan_id ON practice_exercises(plan_id);",
    )?;
    Ok(())
}

fn apply_v12(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS interval_mode_sessions (\
      id TEXT PRIMARY KEY,\
      session_date TEXT NOT NULL,\
      started_at TEXT NOT NULL,\
      ended_at TEXT NOT NULL,\
      timed_mode INTEGER NOT NULL DEFAULT 0,\
      planned_total_seconds INTEGER NULL,\
      actual_run_seconds INTEGER NOT NULL DEFAULT 0,\
      interval_duration_seconds INTEGER NOT NULL DEFAULT 1,\
      intervals_completed INTEGER NOT NULL DEFAULT 0,\
      start_bpm INTEGER NOT NULL DEFAULT 60,\
      end_bpm INTEGER NOT NULL DEFAULT 60\
    );\
     CREATE INDEX IF NOT EXISTS idx_interval_mode_sessions_date ON interval_mode_sessions(session_date);",
    )?;
    Ok(())
}

fn apply_v13(conn: &Connection) -> Result<()> {
    let interval_repeat_columns: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('practice_exercises') WHERE name = 'interval_repeat'",
        [],
        |row| row.get(0),
    )?;
    if interval_repeat_columns == 0 {
        conn.execute_batch(
            "ALTER TABLE practice_exercises ADD COLUMN interval_repeat INTEGER NOT NULL DEFAULT 0;",
        )?;
    }
    Ok(())
}

fn apply_v14(conn: &Connection) -> Result<()> {
    let linked_audio_columns: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('practice_exercises') WHERE name = 'linked_audio_id'",
        [],
        |row| row.get(0),
    )?;
    if linked_audio_columns == 0 {
        conn.execute_batch("ALTER TABLE practice_exercises ADD COLUMN linked_audio_id TEXT NULL;")?;
    }
    Ok(())
}

fn apply_v15(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS song_maps (\
      library_item_id TEXT PRIMARY KEY REFERENCES library_items(id) ON DELETE CASCADE,\
      start_offset_ms REAL NOT NULL DEFAULT 0,\
      created_at TEXT NOT NULL,\
      updated_at TEXT NOT NULL\
    );\
     CREATE TABLE IF NOT EXISTS song_sections (\
      id TEXT PRIMARY KEY,\
      library_item_id TEXT NOT NULL REFERENCES song_maps(library_item_id) ON DELETE CASCADE,\
      label TEXT NOT NULL,\
      color TEXT NOT NULL DEFAULT '#5dd6a2',\
      timestamp_ms REAL NOT NULL,\
      sort_order INTEGER NOT NULL DEFAULT 0,\
      created_at TEXT NOT NULL\
    );\
     CREATE INDEX IF NOT EXISTS idx_song_sections_library ON song_sections(library_item_id);",
    )
}

fn apply_v16(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS waveform_peaks (\
      library_item_id TEXT PRIMARY KEY REFERENCES library_items(id) ON DELETE CASCADE,\
      peaks BLOB NOT NULL,\
      duration_ms REAL NOT NULL,\
      sample_rate INTEGER NOT NULL,\
      created_at TEXT NOT NULL\
    );",
    )
}

fn apply_v17(conn: &Connection) -> Result<()> {
    // Library items live in localStorage, not SQLite.
    // Remove invalid FK references to non-existent library_items table.
    // Use rename-swap instead of DROP to preserve existing data.
    conn.execute_batch(
        "CREATE TABLE song_maps_new (\
           library_item_id TEXT PRIMARY KEY,\
           start_offset_ms REAL NOT NULL DEFAULT 0,\
           created_at TEXT NOT NULL,\
           updated_at TEXT NOT NULL\
         );\
         INSERT INTO song_maps_new SELECT * FROM song_maps;\
         CREATE TABLE song_sections_new (\
           id TEXT PRIMARY KEY,\
           library_item_id TEXT NOT NULL REFERENCES song_maps(library_item_id) ON DELETE CASCADE,\
           label TEXT NOT NULL,\
           color TEXT NOT NULL DEFAULT '#5dd6a2',\
           timestamp_ms REAL NOT NULL,\
           sort_order INTEGER NOT NULL DEFAULT 0,\
           created_at TEXT NOT NULL\
         );\
         INSERT INTO song_sections_new SELECT * FROM song_sections;\
         CREATE TABLE waveform_peaks_new (\
           library_item_id TEXT PRIMARY KEY,\
           peaks BLOB NOT NULL,\
           duration_ms REAL NOT NULL,\
           sample_rate INTEGER NOT NULL,\
           created_at TEXT NOT NULL\
         );\
         INSERT INTO waveform_peaks_new SELECT * FROM waveform_peaks;\
         DROP TABLE waveform_peaks;\
         DROP TABLE song_sections;\
         DROP TABLE song_maps;\
         ALTER TABLE song_maps_new RENAME TO song_maps;\
         ALTER TABLE song_sections_new RENAME TO song_sections;\
         ALTER TABLE waveform_peaks_new RENAME TO waveform_peaks;\
         CREATE INDEX IF NOT EXISTS idx_song_sections_library ON song_sections(library_item_id);",
    )
}

fn apply_v18(conn: &Connection) -> Result<()> {
    let col_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('practice_exercises') WHERE name = 'preferred_source'",
        [],
        |row| row.get(0),
    )?;
    if col_count == 0 {
        conn.execute_batch(
            "ALTER TABLE practice_exercises ADD COLUMN preferred_source TEXT NULL;",
        )?;
    }
    Ok(())
}

fn apply_v19(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS exercise_bpm_history (\
      id TEXT PRIMARY KEY,\
      exercise_id TEXT NOT NULL,\
      session_date TEXT NOT NULL,\
      bpm INTEGER NOT NULL,\
      recorded_at TEXT NOT NULL,\
      FOREIGN KEY (exercise_id) REFERENCES practice_exercises(id) ON DELETE CASCADE\
    );\
     CREATE INDEX IF NOT EXISTS idx_bpm_history_exercise ON exercise_bpm_history(exercise_id);\
     CREATE INDEX IF NOT EXISTS idx_bpm_history_date ON exercise_bpm_history(session_date);",
    )
}

fn apply_v20(conn: &Connection) -> Result<()> {
    let col_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('practice_session_exercises') WHERE name = 'playback_mode'",
        [],
        |row| row.get(0),
    )?;
    if col_count == 0 {
        conn.execute_batch(
            "ALTER TABLE practice_session_exercises ADD COLUMN playback_mode TEXT DEFAULT NULL;",
        )?;
    }
    // Drop and recreate without FK — library items live in a separate
    // persistence layer (JSON/LocalStorage), not in this SQLite DB.
    conn.execute_batch(
        "DROP TABLE IF EXISTS library_item_stats;\
         CREATE TABLE library_item_stats (\
          library_item_id TEXT PRIMARY KEY,\
          play_count INTEGER NOT NULL DEFAULT 0,\
          total_time_seconds INTEGER NOT NULL DEFAULT 0,\
          loop_count INTEGER NOT NULL DEFAULT 0,\
          last_played_at TEXT\
        );",
    )?;
    Ok(())
}

fn apply_v21(conn: &Connection) -> Result<()> {
    // v20 created library_item_stats with a FK to library_items, but
    // library items live in frontend JSON, not SQLite. Recreate without FK.
    conn.execute_batch(
        "DROP TABLE IF EXISTS library_item_stats;\
         CREATE TABLE library_item_stats (\
          library_item_id TEXT PRIMARY KEY,\
          play_count INTEGER NOT NULL DEFAULT 0,\
          total_time_seconds INTEGER NOT NULL DEFAULT 0,\
          loop_count INTEGER NOT NULL DEFAULT 0,\
          last_played_at TEXT\
        );",
    )?;
    Ok(())
}

fn apply_v22(conn: &Connection) -> Result<()> {
    // Split time tracking into three independent metrics so the global
    // session timer, per-exercise selection time, and actual playback time
    // can be compared (see "General Practice" stats).
    let sessions_has_playback: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('practice_sessions') WHERE name = 'total_playback_seconds'",
        [],
        |row| row.get(0),
    )?;
    if sessions_has_playback == 0 {
        conn.execute_batch(
            "ALTER TABLE practice_sessions ADD COLUMN total_playback_seconds INTEGER NOT NULL DEFAULT 0;",
        )?;
    }
    let exercises_has_playback: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('practice_session_exercises') WHERE name = 'playback_time_seconds'",
        [],
        |row| row.get(0),
    )?;
    if exercises_has_playback == 0 {
        conn.execute_batch(
            "ALTER TABLE practice_session_exercises ADD COLUMN playback_time_seconds INTEGER NOT NULL DEFAULT 0;",
        )?;
    }
    Ok(())
}

fn apply_v23(conn: &Connection) -> Result<()> {
    // Feedback stats — one row per completed Live-Feedback run.
    //
    // `library_item_id` is NOT NULL because every playable tab in the
    // app has a library entry; there is no path where a feedback run
    // happens without one. `exercise_id` IS nullable — the user can
    // open a tab from Library and play without linking it to an
    // active practice exercise. `session_id` mirrors the practice
    // session if one was active when the run ended; also nullable.
    //
    // `details_json` stores a compact per-note array (single-letter
    // keys: t=startMs, n=noteName, o=outcome, pa=pitchAccuracy,
    // co=centsOff, ta=timingAccuracy, to=timingOffsetMs). Kept in a
    // TEXT column rather than a separate rows-table because we only
    // ever query it by run id — no cross-run note analysis planned —
    // and the JSON format stays flexible as the NoteResult shape
    // evolves. Typical size 100–300 KB per run; SQLite handles that
    // trivially.
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS feedback_runs (\
          id INTEGER PRIMARY KEY AUTOINCREMENT,\
          session_id TEXT NULL REFERENCES practice_sessions(id) ON DELETE SET NULL,\
          exercise_id TEXT NULL REFERENCES practice_exercises(id) ON DELETE SET NULL,\
          library_item_id TEXT NOT NULL,\
          ended_at TEXT NOT NULL,\
          duration_seconds INTEGER NOT NULL,\
          strictness_preset TEXT NOT NULL,\
          total_notes INTEGER NOT NULL,\
          hit_count INTEGER NOT NULL,\
          missed_count INTEGER NOT NULL,\
          extra_count INTEGER NOT NULL,\
          pitch_perfect INTEGER NOT NULL,\
          pitch_good INTEGER NOT NULL,\
          pitch_acceptable INTEGER NOT NULL,\
          pitch_wrong INTEGER NOT NULL,\
          timing_perfect INTEGER NOT NULL,\
          timing_good INTEGER NOT NULL,\
          timing_acceptable INTEGER NOT NULL,\
          timing_wrong INTEGER NOT NULL,\
          longest_streak INTEGER NOT NULL,\
          overall_score INTEGER NOT NULL,\
          suggest_slow_down INTEGER NOT NULL DEFAULT 0,\
          suggest_string_muting INTEGER NOT NULL DEFAULT 0,\
          details_json TEXT NOT NULL\
        );\
         CREATE INDEX IF NOT EXISTS idx_feedback_runs_ended_at ON feedback_runs(ended_at DESC);\
         CREATE INDEX IF NOT EXISTS idx_feedback_runs_exercise ON feedback_runs(exercise_id, ended_at DESC);\
         CREATE INDEX IF NOT EXISTS idx_feedback_runs_library ON feedback_runs(library_item_id, ended_at DESC);",
    )?;
    Ok(())
}

fn apply_v24(conn: &Connection) -> Result<()> {
    // Session Journal (PR 4.3) — four nullable columns on
    // `practice_sessions`. All four are nullable because the
    // "Journal has content" filter used by the Stats list is
    // `any column non-null`; pre-v24 sessions legitimately have
    // none of them set.
    //
    // `goal_percent` is an INTEGER in [0, 150]. The TS side clamps
    // at the domain boundary; the DB stores whatever came in so
    // old rows that predate the clamp don't get silently rewritten.
    //
    // `goal_reached` stores 0/1. Nullable so we can distinguish
    // "user hasn't answered yet" from "user said no". Only the
    // review overlay ever writes this column.
    let pairs: &[(&str, &str)] = &[
        ("goal_text", "TEXT NULL"),
        ("review_text", "TEXT NULL"),
        ("goal_percent", "INTEGER NULL"),
        ("goal_reached", "INTEGER NULL"),
    ];
    for (name, ty) in pairs {
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('practice_sessions') WHERE name = ?1",
            [name],
            |row| row.get(0),
        )?;
        if count == 0 {
            conn.execute_batch(&format!(
                "ALTER TABLE practice_sessions ADD COLUMN {name} {ty};"
            ))?;
        }
    }
    Ok(())
}

fn ensure_exercise_intervals_table(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS exercise_intervals (\
      id TEXT PRIMARY KEY,\
      exercise_id TEXT NOT NULL REFERENCES practice_exercises(id) ON DELETE CASCADE,\
      sort_index INTEGER NOT NULL DEFAULT 0,\
      name TEXT NULL,\
      duration_seconds INTEGER NOT NULL,\
      bpm INTEGER NULL,\
      done INTEGER NOT NULL DEFAULT 0,\
      created_at INTEGER NULL\
    );\
     CREATE INDEX IF NOT EXISTS idx_exercise_intervals_exercise_id ON exercise_intervals(exercise_id);",
    )
}

fn recreate_practice_tables(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "DROP TABLE IF EXISTS feedback_runs;\
     DROP TABLE IF EXISTS library_item_stats;\
     DROP TABLE IF EXISTS exercise_bpm_history;\
     DROP TABLE IF EXISTS interval_mode_sessions;\
     DROP TABLE IF EXISTS practice_stats;\
     DROP TABLE IF EXISTS exercise_intervals;\
     DROP TABLE IF EXISTS practice_session_exercises;\
     DROP TABLE IF EXISTS practice_sessions;\
     DROP TABLE IF EXISTS practice_exercises;\
     DROP TABLE IF EXISTS practice_plans;\
     CREATE TABLE IF NOT EXISTS practice_stats (\
      key TEXT PRIMARY KEY,\
      value INTEGER NOT NULL DEFAULT 0\
    );\
     INSERT INTO practice_stats (key, value) VALUES ('intervals_completed_total', 0);\
     CREATE TABLE IF NOT EXISTS practice_plans (\
      id TEXT PRIMARY KEY,\
      title TEXT NOT NULL,\
      timed INTEGER NOT NULL DEFAULT 0,\
      sort_order INTEGER NOT NULL DEFAULT 0,\
      created_at TEXT NOT NULL,\
      updated_at TEXT NOT NULL\
    );\
    CREATE TABLE IF NOT EXISTS practice_exercises (\
      id TEXT PRIMARY KEY,\
      plan_id TEXT NOT NULL REFERENCES practice_plans(id) ON DELETE CASCADE,\
      title TEXT NOT NULL,\
      sort_order INTEGER NOT NULL DEFAULT 0,\
      time_planned_minutes REAL NULL,\
      interval_auto INTEGER NOT NULL DEFAULT 1,\
      interval_repeat INTEGER NOT NULL DEFAULT 0,\
      linked_library_item_id TEXT NULL,\
      linked_audio_id TEXT NULL,\
      preferred_source TEXT NULL,\
      total_time_spent_seconds INTEGER NOT NULL DEFAULT 0,\
      bpm INTEGER NULL,\
      notes TEXT NULL,\
      created_at TEXT NOT NULL,\
      updated_at TEXT NOT NULL\
    );\
     CREATE TABLE IF NOT EXISTS practice_sessions (\
      id TEXT PRIMARY KEY,\
      session_date TEXT NOT NULL,\
      started_at TEXT NOT NULL,\
      ended_at TEXT NULL,\
      total_time_spent_seconds INTEGER NOT NULL DEFAULT 0,\
      total_playback_seconds INTEGER NOT NULL DEFAULT 0,\
      goal_text TEXT NULL,\
      review_text TEXT NULL,\
      goal_percent INTEGER NULL,\
      goal_reached INTEGER NULL,\
      created_at TEXT NOT NULL\
    );\
     CREATE TABLE IF NOT EXISTS practice_session_exercises (\
      id TEXT PRIMARY KEY,\
      session_id TEXT NOT NULL REFERENCES practice_sessions(id) ON DELETE CASCADE,\
      exercise_id TEXT NOT NULL REFERENCES practice_exercises(id) ON DELETE CASCADE,\
      time_spent_seconds INTEGER NOT NULL DEFAULT 0,\
      playback_time_seconds INTEGER NOT NULL DEFAULT 0,\
      playback_mode TEXT DEFAULT NULL,\
      created_at TEXT NOT NULL,\
      UNIQUE(session_id, exercise_id)\
    );\
     CREATE TABLE IF NOT EXISTS exercise_intervals (\
      id TEXT PRIMARY KEY,\
      exercise_id TEXT NOT NULL REFERENCES practice_exercises(id) ON DELETE CASCADE,\
      sort_index INTEGER NOT NULL DEFAULT 0,\
      name TEXT NULL,\
      duration_seconds INTEGER NOT NULL,\
      bpm INTEGER NULL,\
      done INTEGER NOT NULL DEFAULT 0,\
      created_at INTEGER NULL\
    );\
     CREATE TABLE IF NOT EXISTS interval_mode_sessions (\
      id TEXT PRIMARY KEY,\
      session_date TEXT NOT NULL,\
      started_at TEXT NOT NULL,\
      ended_at TEXT NOT NULL,\
      timed_mode INTEGER NOT NULL DEFAULT 0,\
      planned_total_seconds INTEGER NULL,\
      actual_run_seconds INTEGER NOT NULL DEFAULT 0,\
      interval_duration_seconds INTEGER NOT NULL DEFAULT 1,\
      intervals_completed INTEGER NOT NULL DEFAULT 0,\
      start_bpm INTEGER NOT NULL DEFAULT 60,\
      end_bpm INTEGER NOT NULL DEFAULT 60\
    );\
     CREATE TABLE IF NOT EXISTS exercise_bpm_history (\
      id TEXT PRIMARY KEY,\
      exercise_id TEXT NOT NULL,\
      session_date TEXT NOT NULL,\
      bpm INTEGER NOT NULL,\
      recorded_at TEXT NOT NULL,\
      FOREIGN KEY (exercise_id) REFERENCES practice_exercises(id) ON DELETE CASCADE\
    );\
     CREATE TABLE IF NOT EXISTS library_item_stats (\
      library_item_id TEXT PRIMARY KEY,\
      play_count INTEGER NOT NULL DEFAULT 0,\
      total_time_seconds INTEGER NOT NULL DEFAULT 0,\
      loop_count INTEGER NOT NULL DEFAULT 0,\
      last_played_at TEXT\
    );\
     CREATE TABLE IF NOT EXISTS feedback_runs (\
      id INTEGER PRIMARY KEY AUTOINCREMENT,\
      session_id TEXT NULL REFERENCES practice_sessions(id) ON DELETE SET NULL,\
      exercise_id TEXT NULL REFERENCES practice_exercises(id) ON DELETE SET NULL,\
      library_item_id TEXT NOT NULL,\
      ended_at TEXT NOT NULL,\
      duration_seconds INTEGER NOT NULL,\
      strictness_preset TEXT NOT NULL,\
      total_notes INTEGER NOT NULL,\
      hit_count INTEGER NOT NULL,\
      missed_count INTEGER NOT NULL,\
      extra_count INTEGER NOT NULL,\
      pitch_perfect INTEGER NOT NULL,\
      pitch_good INTEGER NOT NULL,\
      pitch_acceptable INTEGER NOT NULL,\
      pitch_wrong INTEGER NOT NULL,\
      timing_perfect INTEGER NOT NULL,\
      timing_good INTEGER NOT NULL,\
      timing_acceptable INTEGER NOT NULL,\
      timing_wrong INTEGER NOT NULL,\
      longest_streak INTEGER NOT NULL,\
      overall_score INTEGER NOT NULL,\
      suggest_slow_down INTEGER NOT NULL DEFAULT 0,\
      suggest_string_muting INTEGER NOT NULL DEFAULT 0,\
      details_json TEXT NOT NULL\
    );\
     CREATE INDEX IF NOT EXISTS idx_feedback_runs_ended_at ON feedback_runs(ended_at DESC);\
     CREATE INDEX IF NOT EXISTS idx_feedback_runs_exercise ON feedback_runs(exercise_id, ended_at DESC);\
     CREATE INDEX IF NOT EXISTS idx_feedback_runs_library ON feedback_runs(library_item_id, ended_at DESC);\
     CREATE INDEX IF NOT EXISTS idx_practice_exercises_plan_id ON practice_exercises(plan_id);\
     CREATE INDEX IF NOT EXISTS idx_practice_sessions_date ON practice_sessions(session_date);\
     CREATE INDEX IF NOT EXISTS idx_practice_session_exercises_session_id ON practice_session_exercises(session_id);\
     CREATE INDEX IF NOT EXISTS idx_practice_session_exercises_exercise_id ON practice_session_exercises(exercise_id);\
     CREATE INDEX IF NOT EXISTS idx_exercise_intervals_exercise_id ON exercise_intervals(exercise_id);\
     CREATE INDEX IF NOT EXISTS idx_interval_mode_sessions_date ON interval_mode_sessions(session_date);\
     CREATE INDEX IF NOT EXISTS idx_bpm_history_exercise ON exercise_bpm_history(exercise_id);\
     CREATE INDEX IF NOT EXISTS idx_bpm_history_date ON exercise_bpm_history(session_date);",
    )
}

#[cfg(test)]
#[path = "tests_schema.rs"]
mod tests;
