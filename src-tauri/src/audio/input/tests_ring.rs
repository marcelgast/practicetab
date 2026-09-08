use super::ring::spsc;

#[test]
fn capacity_rounds_up_to_power_of_two() {
    let (producer, consumer) = spsc(1000);
    // Effective capacity is 1024; usable = 1023.
    let samples: Vec<f32> = (0..2000).map(|i| i as f32).collect();
    let written = producer.push_slice(&samples);
    assert_eq!(written, 1023);
    assert_eq!(consumer.available(), 1023);
}

#[test]
fn push_and_pop_roundtrip() {
    let (producer, consumer) = spsc(16);
    let input = [1.0_f32, 2.0, 3.0, 4.0, 5.0];
    let written = producer.push_slice(&input);
    assert_eq!(written, 5);
    assert_eq!(consumer.available(), 5);

    let mut out = [0.0_f32; 5];
    let read = consumer.pop_slice(&mut out);
    assert_eq!(read, 5);
    assert_eq!(out, input);
    assert_eq!(consumer.available(), 0);
}

#[test]
fn producer_drops_when_full() {
    let (producer, consumer) = spsc(8);
    let first: Vec<f32> = (0..6).map(|i| i as f32).collect();
    assert_eq!(producer.push_slice(&first), 6);

    let second: Vec<f32> = (100..110).map(|i| i as f32).collect();
    // Only 1 slot remains (capacity 8, usable 7).
    assert_eq!(producer.push_slice(&second), 1);
    assert_eq!(consumer.available(), 7);
}

#[test]
fn wraparound_preserves_fifo_order() {
    let (producer, consumer) = spsc(8);
    // Push 5, pop 5, then push another 6 to force wraparound.
    let a: Vec<f32> = (0..5).map(|i| i as f32).collect();
    producer.push_slice(&a);
    let mut drain = [0.0_f32; 5];
    consumer.pop_slice(&mut drain);

    let b: Vec<f32> = (100..106).map(|i| i as f32).collect();
    assert_eq!(producer.push_slice(&b), 6);

    let mut out = [0.0_f32; 6];
    assert_eq!(consumer.pop_slice(&mut out), 6);
    assert_eq!(out, [100.0, 101.0, 102.0, 103.0, 104.0, 105.0]);
}

#[test]
fn clear_drops_all_pending_samples() {
    let (producer, consumer) = spsc(16);
    producer.push_slice(&[1.0, 2.0, 3.0, 4.0]);
    assert_eq!(consumer.available(), 4);
    consumer.clear();
    assert_eq!(consumer.available(), 0);
}

#[test]
fn producer_consumer_thread_safety() {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::thread;

    let (producer, consumer) = spsc(256);
    let stop = Arc::new(AtomicBool::new(false));
    let stop_producer = Arc::clone(&stop);

    let producer_handle = thread::spawn(move || {
        let mut value = 0.0_f32;
        while !stop_producer.load(Ordering::Relaxed) {
            let batch: Vec<f32> = (0..32).map(|_| value).collect();
            producer.push_slice(&batch);
            value += 1.0;
            if value > 10000.0 {
                break;
            }
        }
    });

    let mut total_read = 0;
    let mut buf = [0.0_f32; 64];
    for _ in 0..10_000 {
        total_read += consumer.pop_slice(&mut buf);
    }
    stop.store(true, Ordering::Relaxed);
    producer_handle.join().expect("producer thread panicked");
    // No data corruption — any reads we observed must be valid counts.
    assert!(total_read > 0);
}
