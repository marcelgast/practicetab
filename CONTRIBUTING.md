# Contributing to PracticeTab

Thanks for taking a look. PracticeTab is in maintenance mode — the original
author isn't actively adding features — but bug reports, patches, and forks
are welcome. This document is a short pointer to how the project is
organised and what a contribution should look like.

## Getting set up

You'll need the same prerequisites as a normal build (see [README.md](./README.md)):
Node.js 20+, `pnpm`, the Rust stable toolchain, and the platform SDK for
your OS.

```bash
git clone https://github.com/marcelgast/practicetab.git
cd practicetab
pnpm install
pnpm tauri dev
```

## Coding standards

- Small files. TypeScript/Vue files over 500 lines are a hard limit;
  Rust files over 1000 lines should be split.
- Shallow nesting (max 3–4 levels). Early returns and guard clauses.
- No workarounds; solve problems at the root.
- Minimal diffs — don't refactor unrelated code inside a feature PR.
- Rust: `?` instead of `unwrap()` / `expect()` in production paths;
  `thiserror` for structured errors.
- TypeScript: no `any` in production code.
- Every logic change needs a test. New function → unit test.
  Bug fix → regression test.

## Before you push

Run the full gate locally:

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm build
cd src-tauri && cargo fmt && cargo clippy && cargo test
```

If any of those fail, the CI will fail too. If you're touching the audio
engine, please also do a manual smoke test — start playback, run the
metronome, load a Guitar Pro file, try feedback mode. The tests cover
logic but the audio pipeline is easier to break than they can catch.

## Pull requests

- Open PRs against `master`.
- One concern per PR. If the fix has an unrelated cleanup piggybacked, split
  the cleanup into its own PR.
- Include a short "why" in the PR description — the diff shows the "what".
- If you're adding a feature, include tests for the new logic.
- If you're fixing a bug, add a regression test.

## Trademark reminder

The MIT License covers the code. The **name "PracticeTab" and the app logo
are trademarks** and are not licensed. If you fork this repository and
distribute a build, you must change the app name and swap the icons under
`src-tauri/icons/`. See the Trademarks section in [LICENSE](./LICENSE) for
the full rule.

## Reporting issues

For bugs, please include:

- OS and version
- The steps to reproduce
- Console output from DevTools (Cmd/Ctrl+Shift+I in a dev build)
- The relevant portion of `~/Library/Logs/PracticeTab/*.log` on macOS or the
  equivalent on Windows

Security issues should be reported privately — please don't file public
issues for them. Contact info is on my [GitHub profile](https://github.com/marcelgast).

Thanks again.
