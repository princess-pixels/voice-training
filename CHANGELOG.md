# Changelog

All notable changes to voice-training. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the release job publishes the
top section as the GitHub release notes. The longer story behind each release is in
[HISTORY.md](HISTORY.md).

## [Unreleased]

Nothing yet.

## [1.2.0] - 2026-09-21

### Fixed

- Import archives are a trust boundary: manifest paths are confined to the archive,
  symlinks are refused, a stored audio type has to be one, and every record is held to
  the same rules as the API routes. One bad record is reported, not fatal.
- Today's Practice adopts the new day after midnight, on the server's calendar.
- Deleting a session detaches it from the practice steps it was attached to.
- A proper error page for unknown routes and stale take links.
- The pitch graph no longer draws a line across breaths and pauses.
- Every page has its own title; one h1 per page.
- The sessions list is a card list on phones instead of a clipped table.
- YIN prefers the dip at double the lag when it is clearly deeper, so a weak
  fundamental no longer reads an octave high; and it analyses the newest part of the
  frame, taking ~30 ms off the live readout's delay.
- Malformed API bodies answer 400 with a message, never 500.
- A failed save on the practice page keeps the step and its seconds instead of moving
  on; the step rail is tappable; a finished step can be reviewed from the summary.
- Microphone failures explain what to do; Settings no longer waits forever for a
  device list.
- Keyboard focus survives a whole take: one Start/Stop button, focus into the summary.
- Deleting a take removes the row before the file, and the empty folder with it.
- Total Practice Time counts routine time like the streak does; audio keys and export
  names use the local day.

### Changed

- Pitch is graded against the user's own target range (below / in / above target)
  instead of fixed feminine / androgynous / masculine thresholds.
- The headline pitch of a take, the session list, the dashboard and the trend is now
  the median of the voiced frames, which a laugh or a glide cannot pull up the way
  the mean was; the mean is still shown under it. Existing sessions get their median
  computed from their stored points on first start (schema 2).
- Export is a same-origin POST, one at a time.
- Screen readers hear state changes (recording, saved, errors) and a quiet cents
  readout; animation honours reduced motion; canvas labels meet AA.
- The `?day=&step=` record flow, superseded by the embedded studio, is removed.

### Added

- `src/lib/server/validate.ts`: every input rule in one tested module.
- `src/server.test.ts`: the built server end to end over HTTP, run in CI after the
  build; `bun run coverage:gap` lists what the coverage number leaves out.
- `engines`, `packageManager` and `author` in package.json; a dependabot config.

## [1.1.0] - 2026-09-12

### Added

- Reference notes: a strip of notes around the target range under the pitch graph.
  Tap one to hear it (blip or sustained), see it on the graph, and read how far sharp
  or flat you are, with "On it" inside 10 cents. Arrow keys step a semitone.

## [1.0.1] - 2026-09-12

### Fixed

- A `Host` allowlist (loopback and the `ORIGIN` hostname) against DNS rebinding.
- Range-test notes are capped like session notes.

## [1.0.0] - 2026-09-12

### Added

- The portable edition: one self-contained binary per platform with `bun:sqlite`,
  recordings on local disk, `--data-dir`, `--port`, `--host`, `--open`, export and
  import of the whole library as a `.tar.gz`.
- Today's Practice: a daily routine with a step clock, takes recorded in place,
  streaks that count routines as well as recordings.
- The recording studio with live pitch detection (YIN in a Worker), the range test,
  the exercise library, the dashboard.

[Unreleased]: https://github.com/princess-pixels/voice-training/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/princess-pixels/voice-training/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/princess-pixels/voice-training/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/princess-pixels/voice-training/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/princess-pixels/voice-training/releases/tag/v1.0.0
