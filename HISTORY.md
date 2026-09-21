# History

The dev log, newest first: audit scores, the decisions behind the bigger changes,
and what each push of work landed. Open items live in [TODO.md](TODO.md).

## 2026-09-21 — Round 3 audit: 7.0

A five-agent pass (correctness + types, security + deps, DSP + performance,
architecture + testing, UX + docs) on the same rubric and weights as the Sept 3
audit: **7.0 / 10**, up from 6.1. Per category: correctness 7, security 7, DSP 7,
architecture 7, performance 7, testing 6, types 8, UX 6, docs 7, deps 8. 61 findings
after de-duplication (23 bugs, 27 glow-ups, 11 docs); their ids (A01–E22) are the
ones TODO.md now uses.

Three Highs, all at the edges rather than inside: the import archive followed
manifest paths and tar symlinks verbatim, so a crafted export could copy any
readable file into the served library with an attacker-chosen Content-Type; the
practice page seeded its `day` state once and never adopted the reloaded document,
so the midnight rollover written up below never actually happened; and the sessions
table had no horizontal scroll on phones, hiding View and Delete.

The import boundary was closed the same day: manifest paths are resolved with
`realpath` and confined to the extracted directory, anything but a regular file is
refused, a stored audio type has to pass the same allowlist as an upload (which now
also applies to the multipart fallback), the audio route only ever emits an audio
type, and a session that fails to insert no longer aborts the run or leaves its
recording behind. Four tests cover the traversal, the symlinked file and directory,
the bad type and the orphan.

Two other things the round made plain. The 99.7 % coverage figure measures 29 % of
the source, because Bun only instruments files a test imports: every route, every
component and the recorder store are invisible to CI. And `getPitchCategory`
hard-codes feminine / androgynous / masculine at 180 and 150 Hz regardless of the
configured target range, so the live tile flips to "masculine" whenever the voice
dips, which is the one word the rest of the app's copy is careful never to use.

## 2026-09-12 — 1.1.0 and the portable edition

1.1.0 adds the reference-note strip under the graph (`NoteKeyboard.svelte`,
`audio/notes.ts`, `audio/tone.ts`, `audio/smoothing.ts`). Deploy note for the hosted
install: the server lazy-loads page chunks by filename, so restart the service right
after every `bun run build`; a rebuild under a running service leaves unvisited pages
answering 500 until the restart.

The portable edition is complete (steps 1 to 6 below). The app is one binary on
SQLite and local files, the hosted install runs on it, and a `v*` tag publishes
builds for five platforms.

**Hosted switch-over done 2026-09-12:** voice.mia runs on SQLite from
`~/.local/share/voice-training`. Mongo and MinIO keep the old copy untouched until this
has been running happily for a while; `.env.mongo-backup` swaps back if it ever has to.

### The portable edition (planned 2026-09-09)

One binary someone downloads and double-clicks: metadata in `bun:sqlite`, audio on
local disk, no Mongo, MinIO or Docker. The same binary runs the hosted install under
systemd behind Caddy with a data-directory flag.

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
       export and delete. Two Bun findings are under "Waiting on upstream" in TODO.md.

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

## 2026-09-03 — Second audit: 6.1, and the evening that followed

A second, stricter audit scored 6.1/10 (weights: correctness, security and DSP 0.15
each; architecture, performance and testing 0.10; types 0.08; UX 0.07; docs and
deps 0.05). It found three production-only blockers that the first pass missed, all
fixed the same evening:

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

With those in, the rubric was estimated to land around 7.5. (The Sept 21 re-audit
measured 7.0.)

### Today's Practice

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
back after midnight reloads onto the new day. (The Sept 21 audit found that last
part never worked: see A01 in TODO.md.)
