use super::devices::{device_id_for, host_id_string, list_devices};

#[test]
fn list_outputs_does_not_panic() {
    let host = cpal::default_host();
    let _ = list_devices(&host);
}

#[test]
fn device_id_includes_host_name_and_index() {
    let host = cpal::default_host();
    let host_id = host.id();
    let id = device_id_for("Test Device", host_id, 3);
    assert!(id.contains("Test Device"));
    assert!(id.ends_with("|3"));
    assert!(id.starts_with(&host_id_string(host_id)));
}
