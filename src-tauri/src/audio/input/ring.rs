//! Lock-free single-producer single-consumer ring buffer for audio samples.
//!
//! The producer is the cpal input callback thread; the consumer is the
//! command/worker thread (later: the tuner analyzer). Only one producer and
//! one consumer may exist at a time — this is enforced by ownership of the
//! [`RingProducer`] / [`RingConsumer`] handles returned from [`spsc`].

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

/// Inner shared state of the ring.
///
/// `capacity` is always a power of two so `& mask` replaces `% capacity`.
/// We store `capacity + 1` slots logically by never filling the last one —
/// this keeps `write == read` unambiguously "empty".
struct Inner {
    buffer: Vec<std::cell::UnsafeCell<f32>>,
    capacity: usize,
    mask: usize,
    write: AtomicUsize,
    read: AtomicUsize,
}

// SAFETY: Access to `buffer` slots is disjoint between producer and consumer —
// the producer writes to `[read..write)` and the consumer reads from
// `[read..write)`. Synchronization of the indices via `Ordering::Acquire` /
// `Ordering::Release` establishes the necessary happens-before relationships.
unsafe impl Sync for Inner {}
unsafe impl Send for Inner {}

pub struct RingProducer {
    inner: Arc<Inner>,
}

pub struct RingConsumer {
    inner: Arc<Inner>,
}

/// Construct an SPSC ring with the given minimum capacity.
///
/// The actual capacity is rounded up to the next power of two. The ring can
/// hold `capacity - 1` samples at any given time.
pub fn spsc(min_capacity: usize) -> (RingProducer, RingConsumer) {
    let capacity = min_capacity.next_power_of_two().max(2);
    let mut buffer = Vec::with_capacity(capacity);
    for _ in 0..capacity {
        buffer.push(std::cell::UnsafeCell::new(0.0));
    }
    let inner = Arc::new(Inner {
        buffer,
        capacity,
        mask: capacity - 1,
        write: AtomicUsize::new(0),
        read: AtomicUsize::new(0),
    });
    (
        RingProducer {
            inner: Arc::clone(&inner),
        },
        RingConsumer { inner },
    )
}

impl RingProducer {
    /// Push as many samples as fit. Returns the number written.
    /// Samples beyond the remaining capacity are dropped (caller policy:
    /// the consumer is expected to keep up).
    pub fn push_slice(&self, samples: &[f32]) -> usize {
        let inner = &*self.inner;
        let read = inner.read.load(Ordering::Acquire);
        let write = inner.write.load(Ordering::Relaxed);
        let used = write.wrapping_sub(read);
        let free = inner.capacity.saturating_sub(used).saturating_sub(1);
        let to_write = samples.len().min(free);
        for (i, sample) in samples.iter().take(to_write).enumerate() {
            let slot = write.wrapping_add(i) & inner.mask;
            // SAFETY: producer owns `[write..write+to_write)` exclusively.
            unsafe {
                *inner.buffer[slot].get() = *sample;
            }
        }
        inner
            .write
            .store(write.wrapping_add(to_write), Ordering::Release);
        to_write
    }
}

impl RingConsumer {
    /// Current number of samples available to read.
    #[allow(dead_code)] // used by tests + upcoming tuner (PR 3.2)
    pub fn available(&self) -> usize {
        let inner = &*self.inner;
        let write = inner.write.load(Ordering::Acquire);
        let read = inner.read.load(Ordering::Relaxed);
        write.wrapping_sub(read)
    }

    /// Pop up to `out.len()` samples into `out`. Returns the number read.
    pub fn pop_slice(&self, out: &mut [f32]) -> usize {
        let inner = &*self.inner;
        let write = inner.write.load(Ordering::Acquire);
        let read = inner.read.load(Ordering::Relaxed);
        let available = write.wrapping_sub(read);
        let to_read = out.len().min(available);
        for (i, slot_out) in out.iter_mut().take(to_read).enumerate() {
            let slot = read.wrapping_add(i) & inner.mask;
            // SAFETY: consumer owns `[read..read+to_read)` exclusively.
            unsafe {
                *slot_out = *inner.buffer[slot].get();
            }
        }
        inner
            .read
            .store(read.wrapping_add(to_read), Ordering::Release);
        to_read
    }

    /// Drop all currently buffered samples.
    #[allow(dead_code)] // used by tests + upcoming tuner (PR 3.2)
    pub fn clear(&self) {
        let inner = &*self.inner;
        let write = inner.write.load(Ordering::Acquire);
        inner.read.store(write, Ordering::Release);
    }
}
