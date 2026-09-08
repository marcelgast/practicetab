//! Shared handle that hands the `RingConsumer` from the input engine to a
//! downstream reader (the pitch detector). The input engine installs the
//! consumer when the stream starts and removes it on stop, plus publishes the
//! active sample-rate / channel count. The pitch engine polls the shared
//! state from its own worker thread — cheap `Mutex` / `AtomicU32` access that
//! only happens on start/stop boundaries and from the non-realtime analysis
//! thread (never from the cpal callback).

use std::sync::atomic::{AtomicU16, AtomicU32, Ordering};
use std::sync::Mutex;

use super::ring::RingConsumer;

/// Shared bridge between the `InputEngine` (producer side) and downstream
/// consumers (pitch detector, VU meter, …).
#[derive(Default)]
pub(crate) struct AudioInputBridge {
    consumer: Mutex<Option<RingConsumer>>,
    sample_rate: AtomicU32,
    channels: AtomicU16,
}

impl AudioInputBridge {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// Install the consumer and publish the active stream format. Called by
    /// the input engine worker immediately after the cpal stream starts.
    pub(crate) fn install(&self, consumer: RingConsumer, sample_rate: u32, channels: u16) {
        if let Ok(mut guard) = self.consumer.lock() {
            *guard = Some(consumer);
        }
        self.sample_rate.store(sample_rate, Ordering::Release);
        self.channels.store(channels, Ordering::Release);
    }

    /// Remove the consumer and reset the format. Called on stream stop.
    pub(crate) fn clear(&self) {
        if let Ok(mut guard) = self.consumer.lock() {
            *guard = None;
        }
        self.sample_rate.store(0, Ordering::Release);
        self.channels.store(0, Ordering::Release);
    }

    /// Current sample rate of the live stream, or `0` if nothing is running.
    pub(crate) fn sample_rate(&self) -> u32 {
        self.sample_rate.load(Ordering::Acquire)
    }

    /// Drain up to `out.len()` samples from the consumer. Returns `0` if no
    /// consumer is currently installed (input stopped or not started yet).
    pub(crate) fn pop_slice(&self, out: &mut [f32]) -> usize {
        let Ok(guard) = self.consumer.lock() else {
            return 0;
        };
        guard.as_ref().map(|c| c.pop_slice(out)).unwrap_or(0)
    }

    /// Number of samples currently queued in the ring, or `0` if no consumer.
    #[allow(dead_code)] // consumed by tests + diagnostics in PR 3.3.
    pub(crate) fn available(&self) -> usize {
        let Ok(guard) = self.consumer.lock() else {
            return 0;
        };
        guard.as_ref().map(|c| c.available()).unwrap_or(0)
    }
}
