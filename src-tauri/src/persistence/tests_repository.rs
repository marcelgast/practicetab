use super::*;
use rusqlite::Connection;
use serde_json::json;

fn setup_repo() -> Repository {
    let conn = Connection::open_in_memory().unwrap();
    let repo = Repository::new(conn);
    repo.init().unwrap();
    repo
}

fn insert_dummy_library_item(repo: &Repository, id: &str) {
    let item = LibraryItem {
        id: id.to_string(),
        title: "Dummy".to_string(),
        source_kind: "reference".to_string(),
        source_path: format!("/tmp/{id}.mp3"),
        original_path: None,
        file_name: format!("{id}.mp3"),
        size: 100,
        modified_ms: 1,
        created_at: "2025-01-01T00:00:00Z".to_string(),
        updated_at: "2025-01-01T00:00:00Z".to_string(),
        last_known_ok: true,
        missing_reason: None,
    };
    repo.upsert_library_item(&item).unwrap();
}

#[test]
fn upsert_and_list_plans() {
    let repo = setup_repo();
    let plan = PracticePlan {
        id: "plan-1".to_string(),
        title: "Focus".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };

    repo.upsert_plan(&plan).unwrap();
    let plans = repo.list_plans().unwrap();

    assert_eq!(plans.len(), 1);
    assert_eq!(plans[0], plan);
}

#[test]
fn reorder_plans_updates_sort_order() {
    let mut repo = setup_repo();
    let plan_a = PracticePlan {
        id: "plan-a".to_string(),
        title: "A".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    let plan_b = PracticePlan {
        id: "plan-b".to_string(),
        title: "B".to_string(),
        timed: false,
        sort_order: 1,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_plan(&plan_a).unwrap();
    repo.upsert_plan(&plan_b).unwrap();

    repo.reorder_plans(&["plan-b".to_string(), "plan-a".to_string()])
        .unwrap();

    let plans = repo.list_plans().unwrap();
    assert_eq!(plans[0].id, "plan-b");
    assert_eq!(plans[1].id, "plan-a");
}

#[test]
fn update_plan_timed_persists() {
    let repo = setup_repo();
    let mut plan = PracticePlan {
        id: "plan-1".to_string(),
        title: "Focus".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_plan(&plan).unwrap();
    plan.timed = true;
    repo.upsert_plan(&plan).unwrap();

    let plans = repo.list_plans().unwrap();
    assert!(plans[0].timed);
}

#[test]
fn upsert_and_list_exercises_by_plan() {
    let repo = setup_repo();
    let plan = PracticePlan {
        id: "plan-1".to_string(),
        title: "Focus".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_plan(&plan).unwrap();

    let exercise = PracticeExercise {
        id: "ex-1".to_string(),
        plan_id: plan.id.clone(),
        title: "Warmups".to_string(),
        sort_order: 0,
        time_planned_minutes: Some(10.0),
        interval_auto: true,
        interval_repeat: false,
        linked_library_item_id: Some("lib-1".to_string()),
        linked_audio_id: None,
        preferred_source: None,
        total_time_spent_seconds: 120,
        bpm: None,
        notes: None,
        created_at: "2025-01-02T10:00:00Z".to_string(),
        updated_at: "2025-01-02T10:00:00Z".to_string(),
    };

    repo.upsert_exercise(&exercise).unwrap();
    let exercises = repo.list_exercises_by_plan(&plan.id).unwrap();

    assert_eq!(exercises.len(), 1);
    assert_eq!(exercises[0], exercise);
}

#[test]
fn reorder_exercises_updates_sort_order() {
    let mut repo = setup_repo();
    let plan = PracticePlan {
        id: "plan-1".to_string(),
        title: "Focus".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_plan(&plan).unwrap();

    let ex_a = PracticeExercise {
        id: "ex-a".to_string(),
        plan_id: plan.id.clone(),
        title: "A".to_string(),
        sort_order: 0,
        time_planned_minutes: Some(5.0),
        interval_auto: true,
        interval_repeat: false,
        linked_library_item_id: None,
        linked_audio_id: None,
        preferred_source: None,
        total_time_spent_seconds: 0,
        bpm: None,
        notes: None,
        created_at: "2025-01-02T10:00:00Z".to_string(),
        updated_at: "2025-01-02T10:00:00Z".to_string(),
    };
    let ex_b = PracticeExercise {
        id: "ex-b".to_string(),
        plan_id: plan.id.clone(),
        title: "B".to_string(),
        sort_order: 1,
        time_planned_minutes: Some(5.0),
        interval_auto: true,
        interval_repeat: false,
        linked_library_item_id: None,
        linked_audio_id: None,
        preferred_source: None,
        total_time_spent_seconds: 0,
        bpm: None,
        notes: None,
        created_at: "2025-01-02T10:00:00Z".to_string(),
        updated_at: "2025-01-02T10:00:00Z".to_string(),
    };
    repo.upsert_exercise(&ex_a).unwrap();
    repo.upsert_exercise(&ex_b).unwrap();

    repo.reorder_exercises(&plan.id, &["ex-b".to_string(), "ex-a".to_string()])
        .unwrap();

    let exercises = repo.list_exercises_by_plan(&plan.id).unwrap();
    assert_eq!(exercises[0].id, "ex-b");
    assert_eq!(exercises[1].id, "ex-a");
}

#[test]
fn reorder_intervals_updates_sort_order() {
    let mut repo = setup_repo();
    let plan = PracticePlan {
        id: "plan-1".to_string(),
        title: "Focus".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_plan(&plan).unwrap();
    let exercise = PracticeExercise {
        id: "ex-1".to_string(),
        plan_id: plan.id.clone(),
        title: "Warmups".to_string(),
        sort_order: 0,
        time_planned_minutes: Some(10.0),
        interval_auto: true,
        interval_repeat: false,
        linked_library_item_id: None,
        linked_audio_id: None,
        preferred_source: None,
        total_time_spent_seconds: 0,
        bpm: None,
        notes: None,
        created_at: "2025-01-02T10:00:00Z".to_string(),
        updated_at: "2025-01-02T10:00:00Z".to_string(),
    };
    repo.upsert_exercise(&exercise).unwrap();

    let intervals = [
        ExerciseInterval {
            id: "int-a".to_string(),
            exercise_id: exercise.id.clone(),
            sort_index: 0,
            name: Some("A".to_string()),
            duration_seconds: 60,
            bpm: Some(90),
            done: false,
            created_at: Some(10),
        },
        ExerciseInterval {
            id: "int-b".to_string(),
            exercise_id: exercise.id.clone(),
            sort_index: 1,
            name: Some("B".to_string()),
            duration_seconds: 90,
            bpm: None,
            done: false,
            created_at: Some(11),
        },
        ExerciseInterval {
            id: "int-c".to_string(),
            exercise_id: exercise.id.clone(),
            sort_index: 2,
            name: Some("C".to_string()),
            duration_seconds: 120,
            bpm: Some(110),
            done: false,
            created_at: Some(12),
        },
    ];
    for interval in intervals.iter() {
        repo.upsert_interval(interval).unwrap();
    }

    repo.reorder_intervals(
        &exercise.id,
        &[
            "int-c".to_string(),
            "int-a".to_string(),
            "int-b".to_string(),
        ],
    )
    .unwrap();

    let ordered = repo.list_intervals_by_exercise(&exercise.id).unwrap();
    assert_eq!(ordered[0].id, "int-c");
    assert_eq!(ordered[1].id, "int-a");
    assert_eq!(ordered[2].id, "int-b");
}

#[test]
fn delete_exercise_cascades_intervals() {
    let repo = setup_repo();
    let plan = PracticePlan {
        id: "plan-1".to_string(),
        title: "Focus".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_plan(&plan).unwrap();
    let exercise = PracticeExercise {
        id: "ex-1".to_string(),
        plan_id: plan.id.clone(),
        title: "Warmups".to_string(),
        sort_order: 0,
        time_planned_minutes: Some(10.0),
        interval_auto: true,
        interval_repeat: false,
        linked_library_item_id: None,
        linked_audio_id: None,
        preferred_source: None,
        total_time_spent_seconds: 0,
        bpm: None,
        notes: None,
        created_at: "2025-01-02T10:00:00Z".to_string(),
        updated_at: "2025-01-02T10:00:00Z".to_string(),
    };
    repo.upsert_exercise(&exercise).unwrap();
    repo.upsert_interval(&ExerciseInterval {
        id: "int-a".to_string(),
        exercise_id: exercise.id.clone(),
        sort_index: 0,
        name: Some("A".to_string()),
        duration_seconds: 60,
        bpm: Some(100),
        done: false,
        created_at: Some(10),
    })
    .unwrap();

    repo.delete_exercise(&exercise.id).unwrap();
    let intervals = repo.list_intervals_by_exercise(&exercise.id).unwrap();
    assert!(intervals.is_empty());
}

#[test]
fn clear_interval_done_flags_resets_done() {
    let repo = setup_repo();
    let plan = PracticePlan {
        id: "plan-1".to_string(),
        title: "Focus".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_plan(&plan).unwrap();
    let exercise = PracticeExercise {
        id: "ex-1".to_string(),
        plan_id: plan.id.clone(),
        title: "Warmups".to_string(),
        sort_order: 0,
        time_planned_minutes: Some(10.0),
        interval_auto: true,
        interval_repeat: false,
        linked_library_item_id: None,
        linked_audio_id: None,
        preferred_source: None,
        total_time_spent_seconds: 0,
        bpm: None,
        notes: None,
        created_at: "2025-01-02T10:00:00Z".to_string(),
        updated_at: "2025-01-02T10:00:00Z".to_string(),
    };
    repo.upsert_exercise(&exercise).unwrap();
    repo.upsert_interval(&ExerciseInterval {
        id: "int-a".to_string(),
        exercise_id: exercise.id.clone(),
        sort_index: 0,
        name: Some("A".to_string()),
        duration_seconds: 60,
        bpm: Some(100),
        done: true,
        created_at: Some(10),
    })
    .unwrap();

    repo.clear_interval_done_flags(&exercise.id).unwrap();
    let intervals = repo.list_intervals_by_exercise(&exercise.id).unwrap();
    assert_eq!(intervals.len(), 1);
    assert!(!intervals[0].done);
}

#[test]
fn insert_and_list_interval_mode_sessions() {
    let repo = setup_repo();
    let session = IntervalModeSession {
        id: "ims-1".to_string(),
        session_date: "2025-01-08".to_string(),
        started_at: "2025-01-08T10:00:00Z".to_string(),
        ended_at: "2025-01-08T10:10:00Z".to_string(),
        timed_mode: true,
        planned_total_seconds: Some(900),
        actual_run_seconds: 600,
        interval_duration_seconds: 60,
        intervals_completed: 10,
        start_bpm: 80,
        end_bpm: 90,
    };
    repo.insert_interval_mode_session(&session).unwrap();
    let sessions = repo.list_interval_mode_sessions(None, None).unwrap();
    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0], session);
}

#[test]
fn add_exercise_time_updates_totals() {
    let mut repo = setup_repo();
    let plan = PracticePlan {
        id: "plan-1".to_string(),
        title: "Focus".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_plan(&plan).unwrap();

    let exercise = PracticeExercise {
        id: "ex-1".to_string(),
        plan_id: plan.id.clone(),
        title: "Warmups".to_string(),
        sort_order: 0,
        time_planned_minutes: Some(10.0),
        interval_auto: true,
        interval_repeat: false,
        linked_library_item_id: None,
        linked_audio_id: None,
        preferred_source: None,
        total_time_spent_seconds: 0,
        bpm: None,
        notes: None,
        created_at: "2025-01-02T10:00:00Z".to_string(),
        updated_at: "2025-01-02T10:00:00Z".to_string(),
    };
    repo.upsert_exercise(&exercise).unwrap();

    let session = PracticeSession {
        id: "session-1".to_string(),
        session_date: "2025-01-03".to_string(),
        started_at: "2025-01-03T10:00:00Z".to_string(),
        ended_at: None,
        total_time_spent_seconds: 0,
        total_playback_seconds: 0,
        goal_text: None,
        review_text: None,
        goal_percent: None,
        goal_reached: None,
        created_at: "2025-01-03T10:00:00Z".to_string(),
    };
    repo.insert_session(&session).unwrap();

    repo.add_exercise_time(
        &session.id,
        &exercise.id,
        30,
        "2025-01-03T10:00:30Z",
        "session-ex-1",
        None,
    )
    .unwrap();

    let exercises = repo.list_exercises_by_plan(&plan.id).unwrap();
    assert_eq!(exercises[0].total_time_spent_seconds, 30);

    let entries = repo.list_session_exercises(&session.id).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].time_spent_seconds, 30);

    // Session total must remain untouched — the global/session timer owns it.
    let sessions = repo.list_sessions(None, None).unwrap();
    assert_eq!(sessions[0].total_time_spent_seconds, 0);
}

#[test]
fn add_session_time_updates_only_session_total() {
    // `add_session_time` takes `&self`, not `&mut self`, so the binding
    // does not need to be mutable. Matches `cargo clippy --all-targets
    // -- -D warnings` expectations.
    let repo = setup_repo();
    repo.insert_session(&PracticeSession {
        id: "session-1".to_string(),
        session_date: "2025-01-03".to_string(),
        started_at: "2025-01-03T10:00:00Z".to_string(),
        ended_at: None,
        total_time_spent_seconds: 0,
        total_playback_seconds: 0,
        goal_text: None,
        review_text: None,
        goal_percent: None,
        goal_reached: None,
        created_at: "2025-01-03T10:00:00Z".to_string(),
    })
    .unwrap();

    repo.add_session_time("session-1", 42).unwrap();
    repo.add_session_time("session-1", 8).unwrap();

    let sessions = repo.list_sessions(None, None).unwrap();
    assert_eq!(sessions[0].total_time_spent_seconds, 50);
    assert_eq!(sessions[0].total_playback_seconds, 0);
}

#[test]
fn add_playback_time_routes_to_exercise_and_session() {
    let mut repo = setup_repo();
    let plan = PracticePlan {
        id: "plan-1".to_string(),
        title: "Focus".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_plan(&plan).unwrap();
    let exercise = PracticeExercise {
        id: "ex-1".to_string(),
        plan_id: plan.id.clone(),
        title: "Scales".to_string(),
        sort_order: 0,
        time_planned_minutes: None,
        interval_auto: true,
        interval_repeat: false,
        linked_library_item_id: None,
        linked_audio_id: None,
        preferred_source: None,
        total_time_spent_seconds: 0,
        bpm: None,
        notes: None,
        created_at: "2025-01-02T10:00:00Z".to_string(),
        updated_at: "2025-01-02T10:00:00Z".to_string(),
    };
    repo.upsert_exercise(&exercise).unwrap();
    repo.insert_session(&PracticeSession {
        id: "session-1".to_string(),
        session_date: "2025-01-03".to_string(),
        started_at: "2025-01-03T10:00:00Z".to_string(),
        ended_at: None,
        total_time_spent_seconds: 0,
        total_playback_seconds: 0,
        goal_text: None,
        review_text: None,
        goal_percent: None,
        goal_reached: None,
        created_at: "2025-01-03T10:00:00Z".to_string(),
    })
    .unwrap();

    // Playback while an exercise is expanded — hits both session and per-exercise.
    repo.add_playback_time(
        "session-1",
        Some("ex-1"),
        15,
        "2025-01-03T10:00:15Z",
        "pb-1",
    )
    .unwrap();
    // Playback without an expanded exercise (e.g. library-only audio) — session only.
    repo.add_playback_time("session-1", None, 5, "2025-01-03T10:00:20Z", "pb-2")
        .unwrap();

    let sessions = repo.list_sessions(None, None).unwrap();
    assert_eq!(sessions[0].total_playback_seconds, 20);
    assert_eq!(sessions[0].total_time_spent_seconds, 0);

    let entries = repo.list_session_exercises("session-1").unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].playback_time_seconds, 15);
    assert_eq!(entries[0].time_spent_seconds, 0);
}

#[test]
fn upsert_and_list_library_items() {
    let repo = setup_repo();
    let item = LibraryItem {
        id: "lib-1".to_string(),
        title: "Song".to_string(),
        source_kind: "reference".to_string(),
        source_path: "/music/song.gp5".to_string(),
        original_path: None,
        file_name: "song.gp5".to_string(),
        size: 1200,
        modified_ms: 1700000000000,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
        last_known_ok: true,
        missing_reason: None,
    };

    repo.upsert_library_item(&item).unwrap();
    let items = repo.list_library_items().unwrap();

    assert_eq!(items.len(), 1);
    assert_eq!(items[0], item);

    repo.delete_library_item("lib-1").unwrap();
    let items = repo.list_library_items().unwrap();
    assert!(items.is_empty());
}

#[test]
fn practice_payload_uses_camel_case() {
    let plan = PracticePlan {
        id: "plan-1".to_string(),
        title: "Focus".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };

    let value = serde_json::to_value(&plan).unwrap();
    assert_eq!(
        value,
        json!({
          "id": "plan-1",
          "title": "Focus",
          "timed": false,
          "sortOrder": 0,
          "createdAt": "2025-01-01T10:00:00Z",
          "updatedAt": "2025-01-01T10:00:00Z"
        })
    );
}

#[test]
fn list_sessions_filters_by_date_range() {
    let repo = setup_repo();
    let dates = ["2025-01-01", "2025-01-05", "2025-01-10", "2025-01-15"];
    for (i, date) in dates.iter().enumerate() {
        repo.insert_session(&PracticeSession {
            id: format!("s-{i}"),
            session_date: date.to_string(),
            started_at: format!("{date}T10:00:00Z"),
            ended_at: Some(format!("{date}T10:30:00Z")),
            total_time_spent_seconds: 1800,
            total_playback_seconds: 0,
            goal_text: None,
            review_text: None,
            goal_percent: None,
            goal_reached: None,
            created_at: format!("{date}T10:00:00Z"),
        })
        .unwrap();
    }

    // No filters: all sessions
    let all = repo.list_sessions(None, None).unwrap();
    assert_eq!(all.len(), 4);

    // Only from
    let from_5th = repo.list_sessions(Some("2025-01-05"), None).unwrap();
    assert_eq!(from_5th.len(), 3);
    assert_eq!(from_5th[0].session_date, "2025-01-05");

    // Only to
    let to_10th = repo.list_sessions(None, Some("2025-01-10")).unwrap();
    assert_eq!(to_10th.len(), 3);
    assert_eq!(to_10th.last().unwrap().session_date, "2025-01-10");

    // Both from and to
    let range = repo
        .list_sessions(Some("2025-01-05"), Some("2025-01-10"))
        .unwrap();
    assert_eq!(range.len(), 2);
    assert_eq!(range[0].session_date, "2025-01-05");
    assert_eq!(range[1].session_date, "2025-01-10");
}

#[test]
fn upsert_and_get_song_map() {
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");
    let map = SongMap {
        library_item_id: "lib-1".to_string(),
        start_offset_ms: 500.0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_song_map(&map).unwrap();

    let loaded = repo.get_song_map("lib-1").unwrap().unwrap();
    assert_eq!(loaded.library_item_id, "lib-1");
    assert!((loaded.start_offset_ms - 500.0).abs() < f64::EPSILON);

    assert!(repo.get_song_map("nonexistent").unwrap().is_none());
}

#[test]
fn upsert_song_map_updates_on_conflict() {
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");
    let map = SongMap {
        library_item_id: "lib-1".to_string(),
        start_offset_ms: 0.0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_song_map(&map).unwrap();

    let updated = SongMap {
        start_offset_ms: 1000.0,
        updated_at: "2025-01-02T10:00:00Z".to_string(),
        ..map
    };
    repo.upsert_song_map(&updated).unwrap();

    let loaded = repo.get_song_map("lib-1").unwrap().unwrap();
    assert!((loaded.start_offset_ms - 1000.0).abs() < f64::EPSILON);
    assert_eq!(loaded.updated_at, "2025-01-02T10:00:00Z");
}

#[test]
fn delete_song_map_cascades_sections() {
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");
    let map = SongMap {
        library_item_id: "lib-1".to_string(),
        start_offset_ms: 0.0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_song_map(&map).unwrap();
    repo.upsert_song_section(&SongSection {
        id: "sec-1".to_string(),
        library_item_id: "lib-1".to_string(),
        label: "Intro".to_string(),
        color: "#5dd6a2".to_string(),
        timestamp_ms: 0.0,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
    })
    .unwrap();

    repo.delete_song_map("lib-1").unwrap();
    assert!(repo.get_song_map("lib-1").unwrap().is_none());
    assert!(repo.list_song_sections("lib-1").unwrap().is_empty());
}

#[test]
fn replace_song_sections_swaps_all() {
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");
    let map = SongMap {
        library_item_id: "lib-1".to_string(),
        start_offset_ms: 0.0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_song_map(&map).unwrap();
    repo.upsert_song_section(&SongSection {
        id: "sec-old".to_string(),
        library_item_id: "lib-1".to_string(),
        label: "Old".to_string(),
        color: "#000000".to_string(),
        timestamp_ms: 0.0,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
    })
    .unwrap();

    let new_sections = vec![
        SongSection {
            id: "sec-a".to_string(),
            library_item_id: "lib-1".to_string(),
            label: "Intro".to_string(),
            color: "#5dd6a2".to_string(),
            timestamp_ms: 0.0,
            sort_order: 0,
            created_at: "2025-01-01T10:00:00Z".to_string(),
        },
        SongSection {
            id: "sec-b".to_string(),
            library_item_id: "lib-1".to_string(),
            label: "Verse".to_string(),
            color: "#ff0000".to_string(),
            timestamp_ms: 30000.0,
            sort_order: 1,
            created_at: "2025-01-01T10:00:00Z".to_string(),
        },
    ];
    repo.replace_song_sections("lib-1", &new_sections).unwrap();

    let sections = repo.list_song_sections("lib-1").unwrap();
    assert_eq!(sections.len(), 2);
    assert_eq!(sections[0].id, "sec-a");
    assert_eq!(sections[1].id, "sec-b");
}

#[test]
fn delete_single_song_section() {
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");
    let map = SongMap {
        library_item_id: "lib-1".to_string(),
        start_offset_ms: 0.0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_song_map(&map).unwrap();
    repo.upsert_song_section(&SongSection {
        id: "sec-1".to_string(),
        library_item_id: "lib-1".to_string(),
        label: "Intro".to_string(),
        color: "#5dd6a2".to_string(),
        timestamp_ms: 0.0,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
    })
    .unwrap();

    repo.delete_song_section("sec-1").unwrap();
    assert!(repo.list_song_sections("lib-1").unwrap().is_empty());
}

#[test]
fn upsert_and_get_waveform_peaks() {
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");

    let peaks_data: Vec<f32> = vec![0.1, 0.5, 0.9, 0.3];
    let peaks_bytes: Vec<u8> = peaks_data.iter().flat_map(|f| f.to_le_bytes()).collect();

    let row = WaveformPeaksRow {
        library_item_id: "lib-1".to_string(),
        peaks: peaks_bytes.clone(),
        duration_ms: 5000.0,
        sample_rate: 44100,
        created_at: "2025-01-01T10:00:00Z".to_string(),
    };

    repo.upsert_waveform_peaks(&row).unwrap();

    let loaded = repo.get_waveform_peaks("lib-1").unwrap().unwrap();
    assert_eq!(loaded.library_item_id, "lib-1");
    assert_eq!(loaded.peaks, peaks_bytes);
    assert!((loaded.duration_ms - 5000.0).abs() < f64::EPSILON);
    assert_eq!(loaded.sample_rate, 44100);

    assert!(repo.get_waveform_peaks("nonexistent").unwrap().is_none());
}

#[test]
fn upsert_waveform_peaks_updates_on_conflict() {
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");

    let row = WaveformPeaksRow {
        library_item_id: "lib-1".to_string(),
        peaks: vec![0, 1, 2, 3],
        duration_ms: 5000.0,
        sample_rate: 44100,
        created_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_waveform_peaks(&row).unwrap();

    let updated = WaveformPeaksRow {
        library_item_id: "lib-1".to_string(),
        peaks: vec![4, 5, 6, 7],
        duration_ms: 6000.0,
        sample_rate: 48000,
        created_at: "2025-01-02T10:00:00Z".to_string(),
    };
    repo.upsert_waveform_peaks(&updated).unwrap();

    let loaded = repo.get_waveform_peaks("lib-1").unwrap().unwrap();
    assert_eq!(loaded.peaks, vec![4, 5, 6, 7]);
    assert!((loaded.duration_ms - 6000.0).abs() < f64::EPSILON);
    assert_eq!(loaded.sample_rate, 48000);
}

#[test]
fn delete_waveform_peaks_removes_row() {
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");

    let row = WaveformPeaksRow {
        library_item_id: "lib-1".to_string(),
        peaks: vec![0, 1],
        duration_ms: 1000.0,
        sample_rate: 44100,
        created_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_waveform_peaks(&row).unwrap();
    repo.delete_waveform_peaks("lib-1").unwrap();
    assert!(repo.get_waveform_peaks("lib-1").unwrap().is_none());
}

#[test]
fn insert_and_list_bpm_history() {
    let repo = setup_repo();
    let plan = PracticePlan {
        id: "plan-1".to_string(),
        title: "Focus".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_plan(&plan).unwrap();
    let exercise = PracticeExercise {
        id: "ex-1".to_string(),
        plan_id: plan.id.clone(),
        title: "Scales".to_string(),
        sort_order: 0,
        time_planned_minutes: Some(10.0),
        interval_auto: true,
        interval_repeat: false,
        linked_library_item_id: None,
        linked_audio_id: None,
        preferred_source: None,
        total_time_spent_seconds: 0,
        bpm: None,
        notes: None,
        created_at: "2025-01-02T10:00:00Z".to_string(),
        updated_at: "2025-01-02T10:00:00Z".to_string(),
    };
    repo.upsert_exercise(&exercise).unwrap();

    let entry1 = ExerciseBpmHistoryEntry {
        id: "bpm-1".to_string(),
        exercise_id: "ex-1".to_string(),
        session_date: "2025-01-03".to_string(),
        bpm: 80,
        recorded_at: "2025-01-03T10:00:00Z".to_string(),
    };
    let entry2 = ExerciseBpmHistoryEntry {
        id: "bpm-2".to_string(),
        exercise_id: "ex-1".to_string(),
        session_date: "2025-01-04".to_string(),
        bpm: 90,
        recorded_at: "2025-01-04T10:00:00Z".to_string(),
    };
    repo.insert_bpm_history(&entry1).unwrap();
    repo.insert_bpm_history(&entry2).unwrap();

    let all = repo.list_all_bpm_history().unwrap();
    assert_eq!(all.len(), 2);
    assert_eq!(all[0].bpm, 80);
    assert_eq!(all[1].bpm, 90);
}

#[test]
fn list_bpm_history_by_exercise_filters() {
    let repo = setup_repo();
    let plan = PracticePlan {
        id: "plan-1".to_string(),
        title: "Focus".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_plan(&plan).unwrap();
    let ex1 = PracticeExercise {
        id: "ex-1".to_string(),
        plan_id: plan.id.clone(),
        title: "Scales".to_string(),
        sort_order: 0,
        time_planned_minutes: None,
        interval_auto: true,
        interval_repeat: false,
        linked_library_item_id: None,
        linked_audio_id: None,
        preferred_source: None,
        total_time_spent_seconds: 0,
        bpm: None,
        notes: None,
        created_at: "2025-01-02T10:00:00Z".to_string(),
        updated_at: "2025-01-02T10:00:00Z".to_string(),
    };
    let ex2 = PracticeExercise {
        id: "ex-2".to_string(),
        plan_id: plan.id.clone(),
        title: "Arpeggios".to_string(),
        sort_order: 1,
        time_planned_minutes: None,
        interval_auto: true,
        interval_repeat: false,
        linked_library_item_id: None,
        linked_audio_id: None,
        preferred_source: None,
        total_time_spent_seconds: 0,
        bpm: None,
        notes: None,
        created_at: "2025-01-02T10:00:00Z".to_string(),
        updated_at: "2025-01-02T10:00:00Z".to_string(),
    };
    repo.upsert_exercise(&ex1).unwrap();
    repo.upsert_exercise(&ex2).unwrap();

    repo.insert_bpm_history(&ExerciseBpmHistoryEntry {
        id: "bpm-1".to_string(),
        exercise_id: "ex-1".to_string(),
        session_date: "2025-01-03".to_string(),
        bpm: 80,
        recorded_at: "2025-01-03T10:00:00Z".to_string(),
    })
    .unwrap();
    repo.insert_bpm_history(&ExerciseBpmHistoryEntry {
        id: "bpm-2".to_string(),
        exercise_id: "ex-2".to_string(),
        session_date: "2025-01-03".to_string(),
        bpm: 100,
        recorded_at: "2025-01-03T10:05:00Z".to_string(),
    })
    .unwrap();

    let ex1_history = repo.list_bpm_history_by_exercise("ex-1").unwrap();
    assert_eq!(ex1_history.len(), 1);
    assert_eq!(ex1_history[0].bpm, 80);

    let ex2_history = repo.list_bpm_history_by_exercise("ex-2").unwrap();
    assert_eq!(ex2_history.len(), 1);
    assert_eq!(ex2_history[0].bpm, 100);
}

#[test]
fn upsert_and_list_library_item_stats() {
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");

    // Initial upsert with time
    repo.upsert_library_item_stats("lib-1", 60, false, false, "2025-01-01T10:00:00Z")
        .unwrap();
    let stats = repo.list_all_library_item_stats().unwrap();
    assert_eq!(stats.len(), 1);
    assert_eq!(stats[0].library_item_id, "lib-1");
    assert_eq!(stats[0].total_time_seconds, 60);
    assert_eq!(stats[0].play_count, 0);
    assert_eq!(stats[0].loop_count, 0);
    assert_eq!(
        stats[0].last_played_at.as_deref(),
        Some("2025-01-01T10:00:00Z")
    );

    // Accumulate time
    repo.upsert_library_item_stats("lib-1", 30, false, false, "2025-01-01T10:01:00Z")
        .unwrap();
    let stats = repo.list_all_library_item_stats().unwrap();
    assert_eq!(stats[0].total_time_seconds, 90);

    // Increment play count
    repo.upsert_library_item_stats("lib-1", 0, true, false, "2025-01-01T10:02:00Z")
        .unwrap();
    let stats = repo.list_all_library_item_stats().unwrap();
    assert_eq!(stats[0].play_count, 1);
    assert_eq!(stats[0].total_time_seconds, 90);

    // Increment loop count
    repo.upsert_library_item_stats("lib-1", 0, false, true, "2025-01-01T10:03:00Z")
        .unwrap();
    let stats = repo.list_all_library_item_stats().unwrap();
    assert_eq!(stats[0].loop_count, 1);
}

#[test]
fn add_exercise_time_with_playback_mode() {
    let mut repo = setup_repo();
    let plan = PracticePlan {
        id: "plan-1".to_string(),
        title: "Focus".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_plan(&plan).unwrap();
    let exercise = PracticeExercise {
        id: "ex-1".to_string(),
        plan_id: plan.id.clone(),
        title: "Warmups".to_string(),
        sort_order: 0,
        time_planned_minutes: Some(10.0),
        interval_auto: true,
        interval_repeat: false,
        linked_library_item_id: None,
        linked_audio_id: None,
        preferred_source: None,
        total_time_spent_seconds: 0,
        bpm: None,
        notes: None,
        created_at: "2025-01-02T10:00:00Z".to_string(),
        updated_at: "2025-01-02T10:00:00Z".to_string(),
    };
    repo.upsert_exercise(&exercise).unwrap();
    let session = PracticeSession {
        id: "session-1".to_string(),
        session_date: "2025-01-03".to_string(),
        started_at: "2025-01-03T10:00:00Z".to_string(),
        ended_at: None,
        total_time_spent_seconds: 0,
        total_playback_seconds: 0,
        goal_text: None,
        review_text: None,
        goal_percent: None,
        goal_reached: None,
        created_at: "2025-01-03T10:00:00Z".to_string(),
    };
    repo.insert_session(&session).unwrap();

    // Insert with playback_mode
    repo.add_exercise_time(
        &session.id,
        &exercise.id,
        30,
        "2025-01-03T10:00:30Z",
        "session-ex-1",
        Some("tab"),
    )
    .unwrap();

    let entries = repo.list_session_exercises(&session.id).unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].time_spent_seconds, 30);

    // Verify playback_mode via raw SQL
    let mode: Option<String> = repo
        .conn
        .query_row(
            "SELECT playback_mode FROM practice_session_exercises WHERE id = ?1",
            ["session-ex-1"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(mode.as_deref(), Some("tab"));

    // Update with None playback_mode should preserve existing
    repo.add_exercise_time(
        &session.id,
        &exercise.id,
        10,
        "2025-01-03T10:01:00Z",
        "session-ex-2",
        None,
    )
    .unwrap();

    let mode: Option<String> = repo
        .conn
        .query_row(
            "SELECT playback_mode FROM practice_session_exercises WHERE session_id = ?1 AND exercise_id = ?2",
            ["session-1", "ex-1"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(mode.as_deref(), Some("tab"));

    // Update with different playback_mode should overwrite
    repo.add_exercise_time(
        &session.id,
        &exercise.id,
        5,
        "2025-01-03T10:02:00Z",
        "session-ex-3",
        Some("audio"),
    )
    .unwrap();

    let mode: Option<String> = repo
        .conn
        .query_row(
            "SELECT playback_mode FROM practice_session_exercises WHERE session_id = ?1 AND exercise_id = ?2",
            ["session-1", "ex-1"],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(mode.as_deref(), Some("audio"));
}

#[test]
fn library_item_stats_persist_independently() {
    let repo = setup_repo();
    // Stats can be inserted without a matching library_items row
    // because library items live in a separate persistence layer.
    repo.upsert_library_item_stats("lib-orphan", 100, true, false, "2025-01-01T10:00:00Z")
        .unwrap();

    let stats = repo.list_all_library_item_stats().unwrap();
    assert_eq!(stats.len(), 1);
    assert_eq!(stats[0].library_item_id, "lib-orphan");
    assert_eq!(stats[0].total_time_seconds, 100);
    assert_eq!(stats[0].play_count, 1);
}

#[test]
fn delete_exercise_cascades_bpm_history() {
    let repo = setup_repo();
    let plan = PracticePlan {
        id: "plan-1".to_string(),
        title: "Focus".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2025-01-01T10:00:00Z".to_string(),
        updated_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_plan(&plan).unwrap();
    let exercise = PracticeExercise {
        id: "ex-1".to_string(),
        plan_id: plan.id.clone(),
        title: "Scales".to_string(),
        sort_order: 0,
        time_planned_minutes: None,
        interval_auto: true,
        interval_repeat: false,
        linked_library_item_id: None,
        linked_audio_id: None,
        preferred_source: None,
        total_time_spent_seconds: 0,
        bpm: None,
        notes: None,
        created_at: "2025-01-02T10:00:00Z".to_string(),
        updated_at: "2025-01-02T10:00:00Z".to_string(),
    };
    repo.upsert_exercise(&exercise).unwrap();
    repo.insert_bpm_history(&ExerciseBpmHistoryEntry {
        id: "bpm-1".to_string(),
        exercise_id: "ex-1".to_string(),
        session_date: "2025-01-03".to_string(),
        bpm: 80,
        recorded_at: "2025-01-03T10:00:00Z".to_string(),
    })
    .unwrap();

    repo.delete_exercise("ex-1").unwrap();
    let history = repo.list_bpm_history_by_exercise("ex-1").unwrap();
    assert!(history.is_empty());
}

#[test]
fn delete_library_item_cleans_up_waveform_peaks() {
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");

    let row = WaveformPeaksRow {
        library_item_id: "lib-1".to_string(),
        peaks: vec![0, 1],
        duration_ms: 1000.0,
        sample_rate: 44100,
        created_at: "2025-01-01T10:00:00Z".to_string(),
    };
    repo.upsert_waveform_peaks(&row).unwrap();

    repo.delete_library_item("lib-1").unwrap();
    assert!(repo.get_waveform_peaks("lib-1").unwrap().is_none());
}

// ── Feedback runs ──────────────────────────────────────────────

fn make_feedback_run(
    library_item_id: &str,
    exercise_id: Option<&str>,
    score: i64,
    ended_at: &str,
) -> FeedbackRunInsert {
    FeedbackRunInsert {
        session_id: None,
        exercise_id: exercise_id.map(String::from),
        library_item_id: library_item_id.to_string(),
        ended_at: ended_at.to_string(),
        duration_seconds: 180,
        strictness_preset: "intermediate".to_string(),
        total_notes: 100,
        hit_count: 85,
        missed_count: 10,
        extra_count: 5,
        pitch_perfect: 40,
        pitch_good: 30,
        pitch_acceptable: 10,
        pitch_wrong: 5,
        timing_perfect: 35,
        timing_good: 30,
        timing_acceptable: 15,
        timing_wrong: 5,
        longest_streak: 12,
        overall_score: score,
        suggest_slow_down: false,
        suggest_string_muting: false,
        details_json: r#"[{"t":0,"n":"E4","o":"hit","pa":"perfect","co":2,"ta":"perfect","to":5}]"#
            .to_string(),
    }
}

#[test]
fn insert_feedback_run_returns_new_rowid() {
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");

    let run = make_feedback_run("lib-1", None, 75, "2025-01-10T10:00:00Z");
    let id = repo.insert_feedback_run(&run).unwrap();
    assert!(id > 0);

    let second = repo
        .insert_feedback_run(&make_feedback_run(
            "lib-1",
            None,
            80,
            "2025-01-10T11:00:00Z",
        ))
        .unwrap();
    assert_eq!(second, id + 1);
}

#[test]
fn list_feedback_runs_returns_newest_first_without_details_json() {
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");
    repo.insert_feedback_run(&make_feedback_run(
        "lib-1",
        None,
        60,
        "2025-01-10T09:00:00Z",
    ))
    .unwrap();
    repo.insert_feedback_run(&make_feedback_run(
        "lib-1",
        None,
        80,
        "2025-01-10T12:00:00Z",
    ))
    .unwrap();

    let runs = repo.list_feedback_runs(None).unwrap();
    assert_eq!(runs.len(), 2);
    // Newest first — 12:00 before 09:00.
    assert_eq!(runs[0].ended_at, "2025-01-10T12:00:00Z");
    assert_eq!(runs[0].overall_score, 80);
    assert_eq!(runs[1].ended_at, "2025-01-10T09:00:00Z");
    // Overview intentionally omits details_json — asserted by the
    // struct shape at compile time, but double-check with the
    // details lookup.
    let details = repo.get_feedback_run_details(runs[0].id).unwrap().unwrap();
    assert!(details.details_json.contains("\"o\":\"hit\""));
}

#[test]
fn list_feedback_runs_limit_caps_result_count() {
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");
    for i in 0..5 {
        repo.insert_feedback_run(&make_feedback_run(
            "lib-1",
            None,
            70,
            &format!("2025-01-10T10:0{i}:00Z"),
        ))
        .unwrap();
    }

    let runs = repo.list_feedback_runs(Some(2)).unwrap();
    assert_eq!(runs.len(), 2);
}

#[test]
fn list_feedback_runs_for_exercise_filters_by_exercise_id() {
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");
    // Set up two exercises so the FK isn't dangling.
    let plan = PracticePlan {
        id: "plan-1".to_string(),
        title: "P".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2025-01-01T00:00:00Z".to_string(),
        updated_at: "2025-01-01T00:00:00Z".to_string(),
    };
    repo.upsert_plan(&plan).unwrap();
    for id in ["ex-1", "ex-2"] {
        repo.upsert_exercise(&PracticeExercise {
            id: id.to_string(),
            plan_id: "plan-1".to_string(),
            title: id.to_string(),
            sort_order: 0,
            time_planned_minutes: None,
            interval_auto: true,
            interval_repeat: false,
            linked_library_item_id: Some("lib-1".to_string()),
            linked_audio_id: None,
            preferred_source: None,
            total_time_spent_seconds: 0,
            bpm: None,
            notes: None,
            created_at: "2025-01-01T00:00:00Z".to_string(),
            updated_at: "2025-01-01T00:00:00Z".to_string(),
        })
        .unwrap();
    }

    repo.insert_feedback_run(&make_feedback_run(
        "lib-1",
        Some("ex-1"),
        70,
        "2025-01-10T10:00:00Z",
    ))
    .unwrap();
    repo.insert_feedback_run(&make_feedback_run(
        "lib-1",
        Some("ex-2"),
        85,
        "2025-01-10T11:00:00Z",
    ))
    .unwrap();
    repo.insert_feedback_run(&make_feedback_run(
        "lib-1",
        None,
        90,
        "2025-01-10T12:00:00Z",
    ))
    .unwrap();

    let ex1_runs = repo.list_feedback_runs_for_exercise("ex-1", None).unwrap();
    assert_eq!(ex1_runs.len(), 1);
    assert_eq!(ex1_runs[0].overall_score, 70);

    let ex2_runs = repo.list_feedback_runs_for_exercise("ex-2", None).unwrap();
    assert_eq!(ex2_runs.len(), 1);
    assert_eq!(ex2_runs[0].overall_score, 85);
}

#[test]
fn list_feedback_runs_for_library_item_filters_correctly() {
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");
    insert_dummy_library_item(&repo, "lib-2");

    repo.insert_feedback_run(&make_feedback_run(
        "lib-1",
        None,
        70,
        "2025-01-10T10:00:00Z",
    ))
    .unwrap();
    repo.insert_feedback_run(&make_feedback_run(
        "lib-2",
        None,
        90,
        "2025-01-10T11:00:00Z",
    ))
    .unwrap();

    let lib1_runs = repo
        .list_feedback_runs_for_library_item("lib-1", None)
        .unwrap();
    assert_eq!(lib1_runs.len(), 1);
    assert_eq!(lib1_runs[0].overall_score, 70);
}

#[test]
fn get_feedback_run_details_returns_none_for_missing_id() {
    let repo = setup_repo();
    assert!(repo.get_feedback_run_details(999).unwrap().is_none());
}

#[test]
fn delete_feedback_run_removes_row_and_reports_true() {
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");
    let id = repo
        .insert_feedback_run(&make_feedback_run(
            "lib-1",
            None,
            70,
            "2025-01-10T10:00:00Z",
        ))
        .unwrap();

    let deleted = repo.delete_feedback_run(id).unwrap();
    assert!(deleted);
    assert!(repo.get_feedback_run_details(id).unwrap().is_none());

    // Deleting the same row again returns false (already gone).
    assert!(!repo.delete_feedback_run(id).unwrap());
}

#[test]
fn deleting_exercise_nullifies_feedback_run_exercise_id() {
    // ON DELETE SET NULL on exercise_id — the run itself survives
    // but loses its exercise link, so the user's feedback history
    // isn't wiped by cleaning up practice exercises.
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");
    let plan = PracticePlan {
        id: "plan-1".to_string(),
        title: "P".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2025-01-01T00:00:00Z".to_string(),
        updated_at: "2025-01-01T00:00:00Z".to_string(),
    };
    repo.upsert_plan(&plan).unwrap();
    repo.upsert_exercise(&PracticeExercise {
        id: "ex-1".to_string(),
        plan_id: "plan-1".to_string(),
        title: "Ex".to_string(),
        sort_order: 0,
        time_planned_minutes: None,
        interval_auto: true,
        interval_repeat: false,
        linked_library_item_id: Some("lib-1".to_string()),
        linked_audio_id: None,
        preferred_source: None,
        total_time_spent_seconds: 0,
        bpm: None,
        notes: None,
        created_at: "2025-01-01T00:00:00Z".to_string(),
        updated_at: "2025-01-01T00:00:00Z".to_string(),
    })
    .unwrap();

    let id = repo
        .insert_feedback_run(&make_feedback_run(
            "lib-1",
            Some("ex-1"),
            70,
            "2025-01-10T10:00:00Z",
        ))
        .unwrap();

    repo.delete_exercise("ex-1").unwrap();

    let details = repo.get_feedback_run_details(id).unwrap().unwrap();
    assert_eq!(details.overview.exercise_id, None);
    assert_eq!(details.overview.library_item_id, "lib-1");
}

// Keep serde_json import warning-free if it's unused elsewhere.
#[allow(dead_code)]
fn _keep_serde_json_alive() -> serde_json::Value {
    json!({})
}

#[test]
fn list_feedback_runs_with_details_returns_all_rows_chronologically() {
    // Backup export uses this path — we need the full set including
    // details_json, ordered stably for deterministic backup files.
    let repo = setup_repo();
    insert_dummy_library_item(&repo, "lib-1");
    repo.insert_feedback_run(&make_feedback_run(
        "lib-1",
        None,
        70,
        "2025-01-10T11:00:00Z",
    ))
    .unwrap();
    repo.insert_feedback_run(&make_feedback_run(
        "lib-1",
        None,
        85,
        "2025-01-10T09:00:00Z",
    ))
    .unwrap();

    let runs = repo.list_feedback_runs_with_details().unwrap();
    assert_eq!(runs.len(), 2);
    // Chronological (asc by ended_at) — 09:00 first, 11:00 second.
    assert_eq!(runs[0].overview.ended_at, "2025-01-10T09:00:00Z");
    assert_eq!(runs[1].overview.ended_at, "2025-01-10T11:00:00Z");
    // details_json is present on every row.
    for run in &runs {
        assert!(!run.details_json.is_empty());
        assert!(run.details_json.contains("\"o\":"));
    }
}

// ---------------------------------------------------------------------------
// Session Journal (PR 4.3) — update_session_goal, update_session_review,
// clear_session_journal, list_sessions_with_journal.
// ---------------------------------------------------------------------------

fn make_session(id: &str, date: &str) -> PracticeSession {
    PracticeSession {
        id: id.to_string(),
        session_date: date.to_string(),
        started_at: format!("{date}T10:00:00Z"),
        ended_at: None,
        total_time_spent_seconds: 0,
        total_playback_seconds: 0,
        goal_text: None,
        review_text: None,
        goal_percent: None,
        goal_reached: None,
        created_at: format!("{date}T10:00:00Z"),
    }
}

#[test]
fn update_session_goal_persists_and_overwrites() {
    let repo = setup_repo();
    repo.insert_session(&make_session("s-1", "2026-04-23"))
        .unwrap();

    repo.update_session_goal("s-1", "play chords cleanly")
        .unwrap();
    let after_first = repo
        .list_sessions(None, None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    assert_eq!(
        after_first.goal_text.as_deref(),
        Some("play chords cleanly"),
    );
    assert_eq!(after_first.review_text, None);

    // Second write overwrites — no UNIQUE constraint in the way.
    repo.update_session_goal("s-1", "work on rhythm").unwrap();
    let after_second = repo
        .list_sessions(None, None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    assert_eq!(after_second.goal_text.as_deref(), Some("work on rhythm"));
}

#[test]
fn update_session_review_writes_all_three_fields_atomically() {
    let repo = setup_repo();
    repo.insert_session(&make_session("s-1", "2026-04-23"))
        .unwrap();
    repo.update_session_goal("s-1", "master the bridge")
        .unwrap();

    repo.update_session_review("s-1", Some("nailed it"), Some(120), Some(true))
        .unwrap();
    let row = repo
        .list_sessions(None, None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    assert_eq!(row.goal_text.as_deref(), Some("master the bridge"));
    assert_eq!(row.review_text.as_deref(), Some("nailed it"));
    assert_eq!(row.goal_percent, Some(120));
    assert_eq!(row.goal_reached, Some(true));

    // NULL clears individual fields on the next write.
    repo.update_session_review("s-1", None, Some(50), Some(false))
        .unwrap();
    let row = repo
        .list_sessions(None, None)
        .unwrap()
        .into_iter()
        .next()
        .unwrap();
    assert_eq!(row.review_text, None);
    assert_eq!(row.goal_percent, Some(50));
    assert_eq!(row.goal_reached, Some(false));
}

#[test]
fn clear_session_journal_nulls_four_columns_but_keeps_the_session() {
    let repo = setup_repo();
    let mut seed = make_session("s-1", "2026-04-23");
    seed.total_time_spent_seconds = 900;
    repo.insert_session(&seed).unwrap();
    repo.update_session_goal("s-1", "warm up").unwrap();
    repo.update_session_review("s-1", Some("ok"), Some(75), Some(false))
        .unwrap();

    repo.clear_session_journal("s-1").unwrap();

    let row = repo
        .list_sessions(None, None)
        .unwrap()
        .into_iter()
        .next()
        .expect("session row must survive journal clear");
    assert_eq!(row.goal_text, None);
    assert_eq!(row.review_text, None);
    assert_eq!(row.goal_percent, None);
    assert_eq!(row.goal_reached, None);
    // Session itself + its time are untouched.
    assert_eq!(row.total_time_spent_seconds, 900);
}

#[test]
fn list_sessions_with_journal_filters_to_populated_rows_only() {
    let repo = setup_repo();
    // Three sessions on different days; only the middle two get
    // any journal content.
    repo.insert_session(&make_session("s-empty", "2026-04-21"))
        .unwrap();
    repo.insert_session(&make_session("s-goal-only", "2026-04-22"))
        .unwrap();
    repo.insert_session(&make_session("s-reviewed", "2026-04-23"))
        .unwrap();

    repo.update_session_goal("s-goal-only", "warm up").unwrap();
    repo.update_session_goal("s-reviewed", "solo runs").unwrap();
    repo.update_session_review("s-reviewed", Some("great"), Some(100), Some(true))
        .unwrap();

    let list = repo.list_sessions_with_journal().unwrap();
    let ids: Vec<&str> = list.iter().map(|s| s.id.as_str()).collect();
    // Newest-first by started_at.
    assert_eq!(ids, ["s-reviewed", "s-goal-only"]);
    assert!(!ids.contains(&"s-empty"));
}

#[test]
fn foreign_key_enforcement_is_active() {
    // Regression for review finding #11. Without `PRAGMA foreign_keys
    // = ON` SQLite silently ignores REFERENCES + CASCADE clauses,
    // so all of the schema's relational guarantees were dead text.
    // This test asserts the pragma is set on every connection
    // init_db touches by attempting a known-bad insert and expecting
    // a constraint violation. Insertion of a `practice_exercises`
    // row referencing a non-existent plan must fail.
    let repo = setup_repo();
    let exercise = PracticeExercise {
        id: "ex-orphan".to_string(),
        plan_id: "plan-does-not-exist".to_string(),
        title: "Orphan".to_string(),
        sort_order: 0,
        time_planned_minutes: None,
        interval_auto: false,
        interval_repeat: false,
        linked_library_item_id: None,
        linked_audio_id: None,
        preferred_source: None,
        total_time_spent_seconds: 0,
        bpm: None,
        notes: None,
        created_at: "2026-04-29T00:00:00Z".to_string(),
        updated_at: "2026-04-29T00:00:00Z".to_string(),
    };
    let result = repo.upsert_exercise(&exercise);
    assert!(
        result.is_err(),
        "FK enforcement should reject inserting an exercise that references a missing plan_id; got Ok",
    );
}

#[test]
fn cascade_delete_actually_runs_with_foreign_keys_on() {
    // Companion to the "FK enforcement is active" test — proves
    // that the ON DELETE CASCADE clauses now actually fire when
    // the parent row is removed. Prior to enabling foreign_keys
    // the cascade was dead text and child rows became orphans.
    let repo = setup_repo();
    let plan = PracticePlan {
        id: "plan-with-children".to_string(),
        title: "Parent".to_string(),
        timed: false,
        sort_order: 0,
        created_at: "2026-04-29T00:00:00Z".to_string(),
        updated_at: "2026-04-29T00:00:00Z".to_string(),
    };
    repo.upsert_plan(&plan).unwrap();
    let exercise = PracticeExercise {
        id: "ex-child".to_string(),
        plan_id: plan.id.clone(),
        title: "Child".to_string(),
        sort_order: 0,
        time_planned_minutes: None,
        interval_auto: false,
        interval_repeat: false,
        linked_library_item_id: None,
        linked_audio_id: None,
        preferred_source: None,
        total_time_spent_seconds: 0,
        bpm: None,
        notes: None,
        created_at: "2026-04-29T00:00:00Z".to_string(),
        updated_at: "2026-04-29T00:00:00Z".to_string(),
    };
    repo.upsert_exercise(&exercise).unwrap();
    assert_eq!(repo.list_exercises_by_plan(&plan.id).unwrap().len(), 1);

    repo.delete_plan(&plan.id).unwrap();

    assert!(
        repo.list_exercises_by_plan(&plan.id).unwrap().is_empty(),
        "exercise must be cascade-deleted when its plan is removed; orphan would mean FK enforcement is off",
    );
}

#[test]
fn list_sessions_with_journal_includes_rows_with_only_percent_or_reached() {
    // Matches the "any journal column non-null" filter — percent or
    // goal-reached without text still counts.
    let repo = setup_repo();
    repo.insert_session(&make_session("s-percent", "2026-04-22"))
        .unwrap();
    repo.insert_session(&make_session("s-reached", "2026-04-23"))
        .unwrap();
    repo.update_session_review("s-percent", None, Some(40), None)
        .unwrap();
    repo.update_session_review("s-reached", None, None, Some(false))
        .unwrap();

    let list = repo.list_sessions_with_journal().unwrap();
    assert_eq!(list.len(), 2);
}
