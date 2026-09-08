<div align="center">

# PracticeTab

**An offline-first desktop app for focused guitar practice.**
Guitar Pro tabs, a synced metronome, a playback + practice engine, real-time pitch feedback — all in one Tauri app, all local.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey.svg)](#build-from-source)
[![Made with Tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB)](https://tauri.app)
[![Vue 3](https://img.shields.io/badge/frontend-Vue%203-42b883)](https://vuejs.org)
[![Rust](https://img.shields.io/badge/backend-Rust-orange.svg)](https://www.rust-lang.org)

<!-- TODO: hero screenshot -->
<!-- ![PracticeTab hero](docs/media/hero.png) -->

</div>

---

## About

PracticeTab is a guitar-practice tool that stays out of the way. It loads a Guitar Pro file, renders the tab, keeps a metronome in lockstep with the score, times your practice sessions, and — when you want it — listens through your microphone and tells you where you drifted.

Nothing leaves your machine. There is no login, no cloud sync, no telemetry. Practice data lives in a local SQLite database and never phones home.

The project was originally a paid product; from version 1.4.0 onward it is free and open under the MIT license, kept alive here as a portfolio piece and a small useful tool.

## Features

- **Guitar Pro playback** — load `.gp`, `.gp3`, `.gp4`, `.gp5`, `.gpx`, `.gp7`, and `.mus` files. Rendering by [alphaTab](https://alphatab.net); playback synthesis in a native Rust audio engine.
- **Two layout modes** — the classic multi-line score view for readability, plus a horizontal "one-liner" mode for focused practice on a single passage.
- **Metronome that follows the score** — tempo and time-signature changes in the tab drive the click; five sample sets (drum kit, hype, metal kit, ride kit, tock) for the sound you want.
- **Practice sessions and stats** — timed intervals, per-exercise BPM history, streak tracking, session journal with optional goal + review.
- **Real-time pitch feedback** — captures audio through cpal, runs pitch detection against the expected notes at the current playhead, and scores each note on pitch and timing.
- **Backing tracks** — load MP3/WAV/FLAC/OGG audio alongside a tab, time-stretch independently of pitch.
- **Backups you own** — one file, plaintext JSON with a small header, portable across machines.

## Tech stack

| Layer            | Choice                                                                                                                                                                                                                | Why                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Shell            | [Tauri 2](https://tauri.app)                                                                                                                                                                                          | Small, native, cross-platform, no Electron overhead                                                            |
| UI               | Vue 3 + Vite + [reka-ui](https://reka-ui.com) + Pinia                                                                                                                                                                 | Reactive, fast to iterate, tiny bundle                                                                         |
| Tab rendering    | [alphaTab 1.8](https://alphatab.net)                                                                                                                                                                                  | The mature Guitar Pro renderer                                                                                 |
| Audio engine     | Rust + [cpal](https://github.com/RustAudio/cpal) + [rustysynth](https://github.com/sinshu/rustysynth) + [symphonia](https://github.com/pdeljanov/Symphonia) + [signalsmith-stretch](https://signalsmith-audio.co.uk/) | One engine mixes SoundFont playback, metronome, backing tracks, and time-stretch                               |
| Pitch analysis   | Rust + [pitch-detection](https://github.com/alesgenova/pitch-detection)                                                                                                                                               | Autocorrelation-based, low-latency                                                                             |
| Persistence      | SQLite via [rusqlite](https://github.com/rusqlite/rusqlite)                                                                                                                                                           | Single file, versioned migrations                                                                              |
| macOS mic prompt | Native `AVCaptureDevice` via [objc2](https://github.com/madsmtm/objc2) + [block2](https://crates.io/crates/block2)                                                                                                    | The plain cpal path silently fails when Hardened Runtime is in the mix; this triggers the OS prompt explicitly |

## Architecture at a glance

```
┌───────────────────────────────────────────────────┐
│                    Vue 3 UI                        │
│  Library · Player · Metronome · Practice · Stats  │
│              Pinia stores (thin state)             │
└───────────────────────┬───────────────────────────┘
                        │ Tauri IPC (invoke)
┌───────────────────────▼───────────────────────────┐
│                Rust core (src-tauri)               │
│  Audio engine    Persistence (SQLite)              │
│  ├── Mixer       ├── Migrations                    │
│  ├── Synth       ├── Library / Practice / Feedback │
│  ├── Metronome   Audio decode (mp3/wav/flac/ogg)   │
│  ├── Song player Mic pipeline + pitch detection    │
│  └── Time-stretch                                  │
└───────────────────────────────────────────────────┘
```

Playback, metronome click, backing tracks, and pitch analysis all share a single Rust audio engine — one output device selection, one master volume, no WebAudio.

## Build from source

Prerequisites:

- Node.js 20+ and pnpm
- Rust toolchain (stable)
- Platform SDK:
  - **macOS** — Xcode Command Line Tools (`xcode-select --install`)
  - **Windows** — Visual Studio Build Tools + WebView2 runtime

Clone and run:

```bash
git clone https://github.com/marcelgast/practicetab.git
cd practicetab
pnpm install
pnpm tauri dev
```

Production build (creates a `.dmg` / `.msi` under `src-tauri/target/release/bundle/`):

```bash
pnpm tauri build
```

macOS builds from source are ad-hoc-signed and unsigned by Gatekeeper; on first launch either open via right-click → Open, or:

```bash
xattr -dr com.apple.quarantine /Applications/PracticeTab.app
```

## Development

Common commands:

```bash
pnpm dev            # Vite dev server (frontend only)
pnpm tauri dev      # full app in dev mode
pnpm test           # frontend tests (Vitest)
pnpm typecheck      # vue-tsc
pnpm lint           # ESLint
pnpm format         # Prettier

cd src-tauri
cargo test          # backend tests
cargo clippy
cargo fmt
```

Contributing notes and coding standards are in [CONTRIBUTING.md](./CONTRIBUTING.md).

## Project status

PracticeTab is **feature-complete and archived** — no scheduled feature releases from the original author. The code, tests, and build tooling are here for anyone who wants to fork it, extend it, or learn from it. The signing / notarization / auto-update pipeline that shipped commercial builds is not part of this public repository; forks that want to distribute signed binaries need to bring their own signing setup.

If you build something interesting on top of it, I'd love to see it — open an issue or drop me a note.

## License

MIT — see [LICENSE](./LICENSE). Third-party components are enumerated in [THIRD_PARTY_NOTICES.txt](./THIRD_PARTY_NOTICES.txt).

The "PracticeTab" name and logo are trademarks and are **not** covered by the MIT grant — see the Trademarks section of the LICENSE. Forks intended for distribution must change the name and swap the app icon.

## Credits

Built by [Marcel Gast](https://github.com/marcelgast). Standing on the shoulders of the AlphaTab, Tauri, Vue, and Rust audio communities — see the notices file for the full list of what's inside.
