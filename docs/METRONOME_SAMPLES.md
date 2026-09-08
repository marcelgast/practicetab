# Metronome Samples — Signal Chain Notes

All metronome samples shipped with PracticeTab were recorded and produced
by the project author. This document exists so that future contributors and
users know where the sounds came from and can reproduce or extend the sets.

The samples live under
[`src-tauri/src/audio/metronome_samples/`](../src-tauri/src/audio/metronome_samples/)
and are wired into the metronome via the sample-set picker in the Metronome
page.

## Sets

| Set         | Style                                    | Files                              |
| ----------- | ---------------------------------------- | ---------------------------------- |
| `tock`      | Clean woodblock — the default click      | `up.wav`, `down.wav`               |
| `drum_kit`  | Full acoustic drum kit — kick + snare    | `up.wav`, `down.wav`, `accent.wav` |
| `hype`      | Punchy electronic click for tempo pushes | `up.wav`, `down.wav`               |
| `metal_kit` | Tight metal-style kit                    | `up.wav`, `down.wav`               |
| `ride_kit`  | Ride-forward jazz kit                    | `up.wav`, `down.wav`               |

## Signal chain

> _To be filled in by the original author. Roughly: source (Logic Pro X
> instrument or recorded), plugin chain per set (EQ, compression, saturation,
> reverb), sample rate + bit depth, normalisation target._

The intent of writing this down is so that anyone can add a new set that
sits at the same perceived loudness and character as the shipped ones —
important because the metronome click gets layered under practice audio
and inconsistencies stand out fast.

## Format

- 44.1 kHz, 16-bit, mono WAV
- Peak-normalized to around -3 dBFS
- Trimmed to the transient plus a short natural tail (~100–300 ms)

## Adding a new set

1. Drop the WAV files into a new subdirectory of `metronome_samples/`.
2. Match the file naming: `up.wav` (regular click), `down.wav` (downbeat),
   optionally `accent.wav`.
3. Register the set in the metronome sample enumerator (Rust side — see
   `src-tauri/src/audio/metronome*`).
4. Test at a range of BPMs (60, 90, 120, 180) to confirm the click stays
   audible under playback without ducking on its own.

## License

The bundled samples are MIT-licensed alongside the source code — see the
top-level [`LICENSE`](../LICENSE) and the "Own assets" section of
[`THIRD_PARTY_NOTICES.txt`](../THIRD_PARTY_NOTICES.txt).
