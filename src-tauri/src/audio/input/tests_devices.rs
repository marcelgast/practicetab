//! Device-listing tests are `#[ignore]`d because they enumerate real cpal
//! hosts and devices. Some hardware/driver combinations cause cpal's
//! enumeration calls to block for minutes, which would hang `cargo test` in
//! CI and in environments without audio subsystems. Run explicitly with
//! `cargo test -- --ignored` when verifying against real hardware.

use super::devices::{list_input_devices, resolve_input_device, select_input_host};

#[test]
#[ignore = "hits real cpal host enumeration"]
fn select_input_host_returns_some_host() {
    let host = select_input_host();
    let _ = host.id();
}

#[test]
#[ignore = "hits real cpal host enumeration"]
fn list_input_devices_is_stable_across_calls() {
    let host = select_input_host();
    let first = list_input_devices(&host);
    let second = list_input_devices(&host);
    assert_eq!(first.len(), second.len());
    for (a, b) in first.iter().zip(second.iter()) {
        assert_eq!(a.id, b.id);
        assert_eq!(a.name, b.name);
    }
}

#[test]
#[ignore = "hits real cpal host enumeration"]
fn device_ids_are_unique_within_host() {
    let host = select_input_host();
    let devices = list_input_devices(&host);
    let mut ids: Vec<_> = devices.iter().map(|d| d.id.clone()).collect();
    ids.sort();
    let before = ids.len();
    ids.dedup();
    assert_eq!(ids.len(), before, "duplicate device ids: {ids:?}");
}

// ── Pure-logic tests (no hardware) ───────────────────────────────────────

#[test]
fn resolve_malformed_id_returns_invalid_error() {
    let host = cpal::default_host();
    let err = resolve_input_device(&host, Some("not-enough-parts"))
        .err()
        .expect("expected error");
    assert_eq!(err, "audio_input_device_id_invalid");
}

#[test]
fn resolve_nonexistent_host_returns_not_found() {
    let host = cpal::default_host();
    let err = resolve_input_device(&host, Some("FakeHost|fake mic|0"))
        .err()
        .expect("expected error");
    assert_eq!(err, "audio_input_device_not_found");
}

#[test]
fn resolve_unparseable_index_returns_invalid_error() {
    let host = cpal::default_host();
    let err = resolve_input_device(&host, Some("FakeHost|fake mic|abc"))
        .err()
        .expect("expected error");
    assert_eq!(err, "audio_input_device_id_invalid");
}
