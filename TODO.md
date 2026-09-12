# TODO

Known rough edges and ideas, roughly in the order they are worth doing. Each item
says where it lives and why it matters, so it can be picked up cold.

State as of 2026-09-12 (evening): 1.1.0 adds the reference-note strip under the
graph (`NoteKeyboard.svelte`, `audio/notes.ts`, `audio/tone.ts`, `audio/smoothing.ts`).
Deploy note for the hosted install: the server lazy-loads page chunks by filename,
so restart the service right after every `bun run build`; a rebuild under a running
service leaves unvisited pages answering 500 until the restart.

State as of 2026-09-12: the portable edition is complete (steps 1 to 6 below). The app
is one binary on SQLite and local files, the hosted install runs on it, and a `v*` tag
publishes builds for five platforms. Everything before that paragraph block is history.

State as of 2026-09-03 (evening): a second, stricter audit scored 6.1/10 (weights:
correctness, security and DSP 0.15 each; architecture, performance and testing 0.10;
types 0.08; UX 0.07; docs and deps 0.05). It found three production-only blockers
that the first pass missed, all fixed the same evening:

- `BODY_SIZE_LIMIT` (adapter default 512K) rejected any recording over about two
  minutes with a 413 before the route ran. Now set in `.env.example` and documented.
- `ORIGIN` unset made the adapter assume `https`, so on `http://localhost:PORT`
  every upload was a 403. Same fix.
- The dashboard and session list serialised every session's full pitch point
  array into the page. `listSessions` / `getRecentSessions` in `db.ts` now project
  `pitchData.points` away and return `SessionSummary` (2.3 MB to 267 bytes per
  50k-point session).

Later that evening the whole "bugs and polish" and "robustness" lists were cleared
in one pass (malformed ids, page clamping, NaN range, atomic settings, local-day
"Today", title effect, mic grab on the settings page, start re-entrancy, stop and
delete errors surfaced, `goto` after save, `PageData` types, fractional live time,
ranked exercise sort), followed by the performance list: YIN runs in a Worker on a
fixed 25 ms hop, the recorder keeps a plain history with an incremental summary and
publishes only a 12-second window to the live graph, the visualizer batches strokes,
caches the playback layer offscreen and resizes the canvas only on layout changes.
Then the audio, UX and housekeeping lists: YIN rejects above-band pitches instead
of reporting their subharmonic, small text passes WCAG AA, the sidebar collapses to
a drawer below `md`, the canvas has fallback text, pagination and delete buttons are
labelled, there is an SVG favicon, the default range and category classes live in one
place, the footer reads its version from `package.json`, MinIO is pinned, and the
server sends a nonce-based CSP plus the usual hardening headers. Prettier is in,
the repo is formatted, and CI checks it.

With those in, the rubric lands around 7.5. The items below are what stands between
that and an 8, roughly in order.

Late that evening, after the first real use of Today's Practice: progress now lives in
a `practiceDays` document per local day (`src/lib/server/practice.ts` is the pure,
tested part; `db.ts` does the upsert-on-open and an optimistic-lock step update). The
practice page reads and writes that document, the timer is wall-clock anchored and
banks its seconds on every step change and on navigation, and a take recorded via
`?day=&step=` on the record route attaches itself to the step and returns to the
routine. The streak counts a routine with at least one done step, not only recordings.
Export manifest is version 2 with `practiceDays`.

Then, the same night: the recorder is embedded in the practice page
(`RecordingStudio` has an `embedded` mode with an `onSaved` callback and a bindable
`busy` flag that locks step changes mid-take), a saved take shows its summary inline
and marks the step done, time on a step is the visible wall-clock time on it (paused
while the tab is hidden, one stretch capped at 30 minutes, no button), the dashboard
has a today banner, the practice page a two-week history strip, and a tab that comes
back after midnight reloads onto the new day.

## Today's Practice, next

- [ ] **History page.** The strip shows two weeks; a `/practice/history` page with
      per-step times and the takes of each day is the natural next step once there
      is a month of data to look at.
- [ ] The step clock counts visible time whether or not you are actually practising.
      Good enough for one user who knows that; if it ever matters, drop time while the
      recorder is idle for more than a few minutes.

## Portable edition (the next big one)

Planned 2026-09-09. One binary someone downloads and double-clicks: metadata in
`bun:sqlite`, audio on local disk, no Mongo, MinIO or Docker. The same binary runs
the hosted install under systemd behind Caddy with a data-directory flag.

**Decision: replace Mongo and MinIO, do not add a second backend.** Only `db.ts`
and `s3.ts` touch infrastructure and every route goes through them; a dual backend
would double every storage change for nothing a single-user app needs. SQLite in
WAL mode is plenty. The storage layer also becomes testable against an in-memory
database, so the `coveragePathIgnorePatterns` list shrinks. Sharing Mongo/MinIO
with mia-journal is co-location, not integration, so nothing else is affected.
The hosted install migrates by export then import, which dogfoods the exact path a
client uses to hand a therapist their data.

What changes:

- `db.ts` on SQLite. Tables: sessions, session_points (one JSON blob per session,
  so lists never touch the points), exercises, range_tests, practice_days (steps as
  JSON), settings. Ids become UUIDv7 strings; the id validator also accepts legacy
  24-hex ids so imported data keeps its links. The optimistic lock on practice
  steps becomes a plain transaction. Function names and return shapes stay, so the
  routes do not change (except the `exerciseId` regex in the sessions POST).
- `s3.ts` becomes `audio.ts`: the same five functions against `<data>/audio/`.
  Range requests come from `Bun.file().slice().stream()`. Reject keys containing
  `..` even though they are generated server-side.
- Bootstrap: migrate + seed; no bucket check.
- Import (new): reads manifest v1 and v2, inserts rows, copies audio. Export format
  unchanged.
- Config: `--data-dir`, `--port`, `--open/--no-open` (env equivalents for systemd).
  Default data dir is the platform user-data folder. The binary sets `ORIGIN` to
  `http://localhost:PORT` and `BODY_SIZE_LIMIT` itself, so the two production-only
  footguns from the audit disappear.
- README front door becomes download, run, browser opens. The Docker path goes.

Risks, in the order to retire them:

- ~~Static assets inside the compiled binary.~~ Retired by the spike below: the
  adapter's `readdirSync` over `import.meta.dir` works on the embedded file system.
- Binaries are ~100 MB each (they carry the Bun runtime). Say so in the README.
- Unsigned binaries: macOS Gatekeeper and Windows SmartScreen both complain.
  Document the right-click-open workaround; signing is not worth the money yet.
- Export and import shell out to `tar`; Windows has shipped it since 2018, fine.
- Mic access works because `localhost` is a secure context. That is the whole
  reason a local binary beats a shared server for a client.

Order of work (rough sizes):

1. [x] Compile spike on the current build (2026-09-09). It works as is:

   ```bash
   bun run build
   bun build --compile --target=bun ./build/index.js --asset ./build/client --outfile dist/voice-training
   ```

   67 MB binary. Run from a directory with no `build/` nearby and with the real
   `build/client` renamed away, it served the SSR dashboard and practice page,
   `/_app/immutable/*` with the immutable cache header, the precompressed brotli
   variant, 206 on Range requests, and 404 for a missing asset. So the adapter's
   `readdirSync` over `import.meta.dir` works on the embedded file system and no
   custom entry is needed. Two notes: the ETag is `W/"<size>-0"` because embedded
   files have no mtime (harmless, the names are hashed), and the binary autoloads a
   `.env` from its working directory, which the CLI flags should override.

2. [x] `audio.ts`, then the `db.ts` port with schema and in-memory tests (2026-09-12).
       Landed as planned: six tables, `PRAGMA user_version` for the schema version,
       UUIDv7 ids with the 24-hex form still accepted, function names and return
       shapes unchanged so no route changed beyond the id regex. `s3.ts`, `sigv4.ts`,
       the `mongodb` dependency and `docker-compose.yml` are gone; `DATA_DIR` (default
       `./data`, `:memory:` in tests) is the only new setting. Both modules are at
       100% coverage and the `coveragePathIgnorePatterns` list is down to
       `export.ts`. Smoke-tested against the production build: every page, upload,
       whole and ranged playback (206/416), settings, range tests, practice steps,
       export and delete. Two Bun findings are under "Waiting on upstream".

3. [x] Import, then migrate voice.mia by export/import (2026-09-12). `import.ts`
       reads manifest v1 and v2: additive and idempotent (existing rows are skipped,
       local settings win), exercises matched by title with every old id rewritten
       to the local one, unknown titles added under their old id, recordings copied
       under their original keys. `bun run import <archive>` is the CLI. The
       export/import round trip is a test now, so `export.ts` is measured too and
       the coverage ignore list is empty. The hosted library (9 sessions, 3 practice
       days, settings) was exported from the Mongo build and imported into
       `~/.local/share/voice-training`; the archive is kept in its `backups/`.
4. [x] CLI flags, data directory, browser auto-open (2026-09-12). `src/cli.ts` is
       the entry, `src/lib/server/cli.ts` the pure part (parsing, platform data dir,
       option > env > default resolution, opener command) at 100% coverage.
       `--data-dir`, `--port`, `--host`, `--open/--no-open`, `--help`, `--version`,
       and `voice-training import <archive>`. The binary sets ORIGIN to
       `http://localhost:PORT` and BODY_SIZE_LIMIT to 64M unless the environment
       says otherwise, binds 127.0.0.1, and opens the browser only when standalone.
       `bun run build:binary [targets]` builds it in two stages: the CLI is bundled
       into `build/cli-core.js` and a generated `build/cli.js` wrapper imports it and
       `./index.js`, so the compiled bundle's `import.meta.dir` is where the handler
       looks for `client/`. The wrapper exists because a static import of
       `../build/index.js` from src/ made svelte-check type-check the whole build
       output (checkJs is on). Smoke-tested from a bare directory: flags beat a
       `.env` beside the binary, embedded assets serve immutable, a 3 MB upload
       passes on the defaults, `import` restores the archive.
5. [x] Cross-compile CI and a GitHub release on tag (2026-09-12).
       `.github/workflows/release.yml` runs on `v*` tags: checks the tag against
       package.json, runs lint/check/test/build, cross-compiles the five targets in
       one job (Bun fetches each runtime on first use, about 40 MB apiece), packs
       Linux and macOS as tar.gz (keeps the executable bit) and Windows as zip,
       writes SHA256SUMS.txt, and publishes with `gh release create` using
       `.github/release-notes.md` plus generated notes. All five targets were
       cross-compiled locally first (62 to 86 MB each). ci.yml now also builds the
       host binary and runs `--version`, so the wrapper cannot rot unnoticed.
       v1.0.0 ran it for the first time: green in 61 s, five assets plus checksums,
       and the downloaded Linux build verified and served.
6. [x] README rewrite (2026-09-12): the front door is download, run, browser opens;
       source, systemd and proxy setups moved below it; a configuration table that
       shows the binary's defaults next to the source ones. `package.json` is 1.0.0.
       Tagging `v1.0.0` runs the release job for the first time.

**Hosted switch-over done 2026-09-12:** voice.mia runs on SQLite from
`~/.local/share/voice-training`. Mongo and MinIO keep the old copy untouched until this
has been running happily for a while; `.env.mongo-backup` swaps back if it ever has to.

## Ideas

- [ ] **Optional auth.** The README says LAN-only and means it. If that ever
      changes, a `hooks.server.ts` `handle` with HTTP basic auth from an env var is
      about fifteen lines and beats depending on the reverse proxy.

## Waiting on upstream

- **`Bun.file(path).slice(start, end).stream()` ignores the bounds** for a file
  that was written by `Bun.write` earlier in the same process (Bun 1.4.0; a file
  created by another process slices fine). Ranged playback goes through
  `node:fs` `createReadStream` in `audio.ts` instead. Switch back once fixed.
- **`Statement.run().changes` counts cascaded rows** in `bun:sqlite` (deleting a
  session with its points reports 2, where SQLite's own `changes()` says 1).
  `deleteSession` checks `>= 1`. Informational, but do not write `=== 1` again.
- **`Bun.Archive` writes zero-byte entries for lazy `Bun.file()` values** (Bun
  1.4.0, both `Archive.write` and the constructor; only in-memory bytes and
  Blobs work). The export shells out to the system `tar` instead so a large
  audio library never has to fit in memory. Switch back once lazy files are
  read.
- **`cookie@0.6.0` low advisory** (GHSA-pxg6-pf52-xh8x) is pinned by
  `@sveltejs/kit`. This app sets no cookies. Clear once Kit bumps it.
- **TypeScript 7 / `@types/node` 26.** `svelte-check` still drives the TS 5
  language service. Revisit when svelte-check supports the Go-native compiler.
- **Bun drops `Content-Length` on streamed responses** and uses chunked transfer.
  Seeking works through `Content-Range`, so this is informational unless a client
  starts caring about the total length up front.
- **Bun's `formData()` replaces a part's declared type** with a guess from the
  filename extension. Worked around with a separate `audioType` field; drop the
  workaround if Bun fixes it.
