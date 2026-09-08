//! Cross-platform microphone permission status + request.
//!
//! macOS gates microphone access via TCC (Transparency, Consent,
//! and Control). The OS only shows its permission prompt the first
//! time an app actually accesses an audio capture device — and only
//! when the app's `Info.plist` carries `NSMicrophoneUsageDescription`
//! AND TCC has no prior decision recorded for the bundle id.
//!
//! Real-world failure mode (Marcel's Mac Mini): the user installs
//! the app, but the prompt was never shown — either because cpal's
//! enumeration path doesn't trigger TCC's "first access" check the
//! way `AVCaptureDevice` does, or because TCC already cached a
//! "denied" verdict from an earlier session. cpal then silently
//! enumerates an empty input device list (or fails to start a
//! stream), the user sees no signal and has no actionable next step.
//!
//! This module surfaces a deterministic permission status and an
//! explicit request that goes through `AVCaptureDevice` — the
//! Apple-blessed entry point that triggers the prompt when the
//! status is `NotDetermined`. Callers (the frontend) drive the UX:
//! prompt the user once on first launch when status is undecided,
//! show a "Open System Settings" deeplink when status is `Denied`.
//!
//! Windows + Linux: cpal manages microphone access without an OS-
//! level prompt model that we'd need to integrate with. The stubs
//! return `Authorized` so the frontend treats the platform as
//! already-granted and never shows the banner. (Windows users with
//! "App can access microphone" toggled off in Settings → Privacy
//! see no devices — cpal returns an empty list there too. We don't
//! reproduce that signal here because there's no Win API analogue
//! to AVCaptureDevice's authorization status that's reliable across
//! Win10/11.)

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MicPermissionStatus {
    /// User hasn't been asked yet. Calling `request_access` will
    /// trigger the OS prompt on macOS.
    NotDetermined,
    /// Granted. Audio input is usable.
    Authorized,
    /// User denied access in the OS prompt OR via System Settings.
    /// `request_access` will NOT re-trigger the prompt (Apple's
    /// design); the user has to flip the toggle in System Settings
    /// → Privacy & Security → Microphone manually.
    Denied,
    /// Parental-controls / MDM lockout. Effectively the same as
    /// `Denied` from the user's perspective but distinct cause.
    Restricted,
}

#[cfg(target_os = "macos")]
mod platform {
    use super::MicPermissionStatus;
    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2::{class, msg_send};
    use objc2_foundation::NSString;

    // AVCaptureDevice authorization-status values. Mirrors the
    // Apple-defined integers so we don't depend on header churn:
    // https://developer.apple.com/documentation/avfoundation/avauthorizationstatus
    const AV_AUTH_NOT_DETERMINED: i64 = 0;
    const AV_AUTH_RESTRICTED: i64 = 1;
    const AV_AUTH_DENIED: i64 = 2;
    const AV_AUTH_AUTHORIZED: i64 = 3;

    /// `AVMediaTypeAudio` — the NSString constant the AVFoundation
    /// API expects. Apple defines it as the four-char-code "soun"
    /// (case-sensitive). Constructed at the call site rather than
    /// linked from the framework so we don't have to drag in
    /// objc2-av-foundation just for one string.
    fn audio_media_type() -> objc2::rc::Retained<NSString> {
        NSString::from_str("soun")
    }

    pub fn current_status() -> MicPermissionStatus {
        let media_type = audio_media_type();
        // Safety: AVCaptureDevice is a foundational AVFoundation
        // class that's been present since macOS 10.7. The selector
        // signature is `+ (AVAuthorizationStatus)authorizationStatusForMediaType:(AVMediaType)`
        // returning an integer enum.
        let status: i64 = unsafe {
            let cls = class!(AVCaptureDevice);
            msg_send![cls, authorizationStatusForMediaType: &*media_type]
        };
        match status {
            AV_AUTH_AUTHORIZED => MicPermissionStatus::Authorized,
            AV_AUTH_DENIED => MicPermissionStatus::Denied,
            AV_AUTH_RESTRICTED => MicPermissionStatus::Restricted,
            AV_AUTH_NOT_DETERMINED => MicPermissionStatus::NotDetermined,
            // Forward-compat: any future enum variant is treated as
            // not-determined so we re-prompt rather than blocking
            // the user with a status we don't understand.
            _ => MicPermissionStatus::NotDetermined,
        }
    }

    pub async fn request_access() -> bool {
        // If already authorized / denied / restricted, the OS
        // doesn't show the prompt; just report current state.
        match current_status() {
            MicPermissionStatus::Authorized => return true,
            MicPermissionStatus::Denied | MicPermissionStatus::Restricted => {
                return false;
            }
            MicPermissionStatus::NotDetermined => {}
        }

        let (tx, rx) = tokio::sync::oneshot::channel::<bool>();
        // The completion handler is called on an arbitrary queue —
        // we shuttle the result through a oneshot so the caller can
        // await on the main runtime. `block2::RcBlock::new` requires
        // the closure to be `Fn + Clone + 'static`, so we cannot
        // capture a bare `Mutex<Option<Sender>>` (not `Clone`); the
        // `Arc` wrapper makes the closure clone-friendly while the
        // inner `Mutex<Option<...>>` ensures the sender is consumed
        // exactly once even though `Fn` blocks are theoretically
        // re-entrant.
        let tx = std::sync::Arc::new(std::sync::Mutex::new(Some(tx)));

        // Scope the Objective-C dance so the non-`Send` types
        // (`Retained<NSString>`, `RcBlock`, raw class pointers) are
        // dropped before the `.await` below. Tauri requires command
        // futures to be `Send`, and the auto-trait analysis is
        // lexical — even an explicit `drop()` on a value declared
        // outside this block wouldn't satisfy it. The retain counts
        // stay valid past the drop: AVFoundation copies the block
        // onto the heap when it consumes it, and the NSString class
        // constant lives forever.
        {
            // Objective-C blocks pass `BOOL` at the ABI level, which
            // is platform-dependent (`_Bool` on Apple Silicon, signed
            // char elsewhere). Rust's bare `bool` doesn't implement
            // objc2's `EncodeArgument`; `objc2::runtime::Bool` does
            // and converts cleanly via `.as_bool()`.
            //
            // `RcBlock::new` requires `Fn + Clone + 'static`, so the
            // sender is wrapped in `Arc<Mutex<Option<_>>>` — Arc to
            // make the closure clone-friendly, Mutex<Option<_>> to
            // ensure the oneshot sender is consumed exactly once
            // even though `Fn` blocks are theoretically re-entrant.
            let block = RcBlock::new({
                let tx = std::sync::Arc::clone(&tx);
                move |granted: Bool| {
                    if let Some(sender) = tx.lock().expect("permission tx lock poisoned").take() {
                        let _ = sender.send(granted.as_bool());
                    }
                }
            });
            let media_type = audio_media_type();
            // Safety: signature is `+ (void)requestAccessForMediaType:
            // (AVMediaType)mediaType completionHandler:(void(^)(BOOL))handler`.
            // The block takes a single BOOL.
            unsafe {
                let cls = class!(AVCaptureDevice);
                let _: () = msg_send![
                    cls,
                    requestAccessForMediaType: &*media_type,
                    completionHandler: &*block,
                ];
            }
        }

        // If `rx` errors (sender dropped without firing — shouldn't
        // happen on this Apple API), default to false so the UX
        // falls into the denied path.
        rx.await.unwrap_or(false)
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    use super::MicPermissionStatus;

    pub fn current_status() -> MicPermissionStatus {
        // Windows / Linux: no analogous OS-level permission prompt
        // we need to drive. Treat as authorized so the frontend
        // banner stays hidden. Real input failures still surface
        // through cpal's "no devices" path.
        MicPermissionStatus::Authorized
    }

    pub async fn request_access() -> bool {
        true
    }
}

pub fn current_status() -> MicPermissionStatus {
    platform::current_status()
}

pub async fn request_access() -> bool {
    platform::request_access().await
}

/// Open the OS-level microphone privacy settings pane.
///
/// We can't go through `tauri-plugin-opener` for this: its default
/// permission set only allows `http(s)://`, `mailto:`, and `tel:`
/// — anything else (`x-apple.systempreferences:`, `ms-settings:`) is
/// silently rejected at the IPC layer before it reaches the OS.
/// Adding the schemes to the capability allow-list works in theory
/// but the plugin's URL parser also rejects custom-scheme URLs that
/// don't conform to RFC 3986's authority component. So we shell out
/// directly via `std::process::Command` and bypass the plugin.
///
/// macOS schema: `com.apple.settings.PrivacySecurity.extension`
/// (the modern System Settings app's Privacy & Security pane). The
/// pre-Ventura `com.apple.preference.security` legacy schema is
/// broken on Tahoe (macOS 26) and inconsistent on Sonoma+ — Apple
/// only loads the top-level Privacy pane and the `?Privacy_Microphone`
/// query is dropped. The new identifier has held steady from
/// Ventura through Tahoe.
///
/// Windows: `ms-settings:privacy-microphone` opens the Microphone
/// privacy page on Windows 10/11. We invoke it via `cmd /C start`
/// because `ms-settings:` is a URI scheme handler, not an
/// executable, and `Command::new("ms-settings:")` would fail.
///
/// Linux: no canonical microphone privacy page across distros, and
/// the banner is hidden anyway (status returns Authorized). No-op
/// keeps the API surface symmetric for the frontend.
#[cfg(target_os = "macos")]
pub fn open_microphone_settings() -> Result<(), String> {
    let url =
        "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_Microphone";
    std::process::Command::new("open")
        .arg(url)
        .status()
        .map_err(|e| format!("failed to launch `open`: {e}"))
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err(format!(
                    "`open` exited with non-zero status: {}",
                    status.code().unwrap_or(-1)
                ))
            }
        })
}

#[cfg(target_os = "windows")]
pub fn open_microphone_settings() -> Result<(), String> {
    // `start` is a `cmd.exe` builtin, not a standalone exe — must go
    // through `cmd /C`. The empty-string second arg is a Windows
    // quirk: `start` interprets the first quoted arg as the window
    // title, so without it `start "ms-settings:..."` would treat
    // the URL as the title and do nothing.
    std::process::Command::new("cmd")
        .args(["/C", "start", "", "ms-settings:privacy-microphone"])
        .status()
        .map_err(|e| format!("failed to launch `cmd /C start`: {e}"))
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err(format!(
                    "`start` exited with non-zero status: {}",
                    status.code().unwrap_or(-1)
                ))
            }
        })
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
pub fn open_microphone_settings() -> Result<(), String> {
    // Linux: banner is never shown (status is unconditionally
    // Authorized), so this should never be called from the UI. No-op
    // keeps the IPC surface symmetric for tests / future platforms.
    Ok(())
}
