# TODO

Open items, grouped by area and roughly in the order they are worth doing. Each says
where it lives and why it matters, so it can be picked up cold. The dev log, audit
scores and the decisions behind the bigger changes are in [HISTORY.md](HISTORY.md).

State as of 2026-09-21: the round 3 audit scored 7.0 (Sept 3: 6.1). Its ids (A = correctness
and types, B = security and deps, C = DSP and performance, D = architecture and testing,
E = UX and docs) are kept below so a fix can name what it closes. The import trust
boundary (B01, B02, B04) is already closed.

## Bugs

- [ ] **A01 · Practice page never adopts the new day after midnight.**
      `practice/+page.svelte:19,30,72-89`. `day` and `currentIndex` are seeded once with
      `untrack(() => data.day)`; `invalidateAll()` refreshes `data.day` but not the local
      copy, so every PATCH after midnight writes into yesterday's row and the clock stays
      stopped. Wrap the body in `{#key data.day?._id}` or reset the local state when the
      id changes, and set `enteredAt` after the reload path too.
- [ ] **A02 · Midnight detection compares the browser's calendar with the server's key.**
      `practice/+page.svelte:80` vs `practice.ts:17`. A UTC server used from a CEST phone
      thinks midnight passed two hours early and the timer silently stops on every refocus.
      Have `load` return the server's today key and compare against that.
- [ ] **A04 · Deleting a session leaves its id in `practice_days.steps[].sessionIds`.**
      `db.ts:408-412`. The practice page keeps a "latest take" link to a 404, and the
      export carries the dangling id along. Strip it inside the same transaction; optionally
      check `sessionExists` in the practice PATCH.
- [ ] **A06 · Importer trusts nested archive shapes.** `import.ts` `readManifest` /
      `readSession`. Sessions and practice days are cast, not checked, and skip every cap
      the HTTP route enforces (200k points, title and notes length, duration, the settings
      range). Share the route's validation with `readSession` (see D01) and validate step
      status and seconds.
- [ ] **A05 · `request.json()` as implicit `any`; malformed bodies become 500s.**
      `api/settings/+server.ts:18-27`, `api/range-tests/+server.ts:19-25`. A null body
      throws a TypeError that the outer catch returns as 500. Copy the practice route's
      `body: unknown` plus guard pattern, ideally as one shared `readJson`.
- [ ] **D07 · Dashboard tests can flake across midnight; export sweep shares the system
      tmpdir.** `db.test.ts:217-261`, `export.ts:102-124`. Use `setSystemTime` in the
      dashboard tests; scope `sweepStaleExports` to a `voice-training` subdirectory of
      `tmpdir()` so a test run cannot sweep a live server's in-flight export.
- [ ] **D04 / E08 · No `+error.svelte` and no `handleError`.** `/nonexistent` and
      `/sessions/<bad id>` render bare "404 Not Found" inside the layout. Add
      `src/routes/+error.svelte` in the app's styling and a `handleError` in
      `hooks.server.ts` as the single logging point.
- [ ] **C01 · Pitch line bridges silences.** `PitchVisualizer.svelte:394-407`. Unvoiced
      frames are never stored and `drawStatic` joins every consecutive pair, so a breath
      becomes a straight segment. Break the path when `p2.t - p1.t` exceeds a couple of hops.
- [ ] **E02 · Keyboard focus is dropped at every stage of a recording.**
      `RecordingStudio.svelte:297-335,350-435`. Start unmounts on press, Stop unmounts on
      press, the summary mounts unfocused. One persistent primary button whose label
      toggles, and move focus to the title input when the summary appears.
- [ ] **E03 · Step rail buttons are 6 px tall.** `practice/+page.svelte:252-269`. Give
      each step a real hit area and keep the thin bar as the visual.
- [ ] **E04 / E07 · Mic failures show raw browser error strings.** `recorder.svelte.ts:139`,
      `mic.ts:16`, `settings/+page.svelte:52-72`. Branch on `err.name` and on
      `!navigator.mediaDevices` for plain-language messages shared by the studio, the range
      test and Settings; treat an empty device list as its own state instead of
      "Loading devices..." forever.
- [ ] **E05 · The cents readout is an `aria-live` region updated ten times a second.**
      `NoteKeyboard.svelte:462`. Announce from a separate hidden region at most once a
      second or only on transitions.
- [ ] **E01 · Sessions table is clipped on phones.** `sessions/+page.svelte:84-113`.
      `overflow-x-auto` as a stopgap, then a stacked card list below `md`.
- [ ] **E17 · README's first-run sentence does not match what happens.** `README.md:32-33`.
      The binary opens the Dashboard, and the mic prompt appears on the first record press.
- [ ] **C04 · No octave-down check in YIN.** `yin.ts:78-97`. A weak fundamental near the
      top of the band reads an octave high or drops out. Check the minimum around `2·tau`.
- [ ] **A07 · A failed PATCH still advances the step and drops the drained seconds.**
      `practice/+page.svelte:92-98,140-156`. Return a boolean from `patchStep` and re-bank on
      failure.
- [ ] **A08 · Audio is removed before the row on delete, written before the row on
      create.** `api/sessions/[id]/+server.ts:30-44`, `api/sessions/+server.ts:135-149`.
      Row first, then file; clean up the file if `createSession` fails; remove the empty
      per-session directory.
- [ ] **A09 · History strip counters include rows outside the two-week window.**
      `practice/+page.svelte:197-204`. Filter `data.history` to `historyKeys` before summing.
- [ ] **A10 · Clicking a step in the completion list does nothing visible.**
      `practice/+page.svelte:273,295-301`. A `reviewing` flag so a finished step can be
      reopened without "Run it again".
- [ ] **E09 · Five pages share the title "Voice Training"; two `h1`s on desktop.** Set a
      title per page; make the sidebar brand a span.

## Glow-ups

- [ ] **D01 · Validation rules live in `+server.ts`, untested and duplicated.** The
      sessions POST alone carries ~110 lines of parsing closed over `RequestHandler`;
      `MAX_NOTES_LENGTH` is declared twice; a local `parseRange` collides by name with the
      exported HTTP-Range one; `summarisePitch` runs twice per upload. A pure
      `src/lib/server/validate.ts` with table tests, routes become adapters. Unlocks A06.
- [ ] **D02 · The coverage number is a false signal.** `bunfig.toml:11-17`. Measured
      files are 2,530 of 8,605 source lines; Bun only instruments what a test imports, so
      routes, components, the store and the client audio path never trip the threshold.
      Fix the bunfig comment and make the gap visible in CI.
- [ ] **D03 · Nothing tests the HTTP layer end to end.** CI boots the binary for
      `--version` only. A `server.test.ts` that spawns `build/index.js` with a temp
      `DATA_DIR` and exercises multipart POST, Range 206/416, a bad `Host`, practice PATCH
      and export, run after the build step.
- [ ] **E06 / E16 · Pitch labels ignore the configured range, and "masculine" is shown
      live.** `audio/utils.ts:43-48` and its four consumers. Derive the bands from the
      saved range and label them below / in / above target. Also "Adam's apple" in
      `exercises.ts:198`.
- [ ] **C02 · YIN analyses the oldest two-thirds of each frame.** `yin.ts:67-75`. The
      newest ~30 ms of every 4096-sample buffer is never read. Index from
      `buffer.length - halfSize - (tauMax + 1)`; same cost.
- [ ] **D05 · Error-handling strategy differs per route.** Four handlers wrap in
      try/catch → 500, three propagate, settings writes `throw error()`, practice maps
      `RangeError` by `instanceof`. Pick propagate-to-Kit with `handleError` (D04) as the
      one logging point.
- [ ] **D06 · Tested pure helpers are dead; the pages reimplement them.**
      `nextStepIndex`, `isPracticed`, `getAudioDevices`, and a third hand-rolled
      `PracticeDay` reviver. A client-safe `src/lib/practice.ts` next to `days.ts`.
- [ ] **B03 · `GET /api/export` builds the whole library on disk for any cross-origin
      request.** Make it a POST (so the origin check applies) or require a custom header;
      cap concurrent exports to one.
- [ ] **C05 · Pitch points are stored at 74 bytes each with a field nothing reads.**
      Round `t` to 1 ms and `hz` to 0.1 Hz in `addPoint`, make `confidence` optional:
      1.7 MB → 0.6 MB per ten-minute take, through upload, SQLite, page payload and export.
- [ ] **C06 · Audio route parses the full pitch blob on every Range request.**
      `sessions/[id]/audio/+server.ts:148`. A `getSessionAudio(id)` that selects only
      `audio_key, audio_type`.
- [ ] **C07 · Playback re-filters the whole point array on every `timeupdate`.**
      `PitchVisualizer.svelte:527-528`. Cache `points` and `timeRange` in `staticFor`.
- [ ] **C08 · Live mode repaints the full background every hop, off the animation
      frame.** Cache the band, grid and axes offscreen; paint through `requestAnimationFrame`
      with a dirty flag.
- [ ] **C10 · "Average pitch" is an arithmetic mean in Hz.** `stats.ts:261-262`. A
      cents-bin histogram in `PitchAccumulator` gives an O(1) median for the headline.
- [ ] **D08 · Svelte 5 idiom slips.** `busy` derived in an `$effect`, the layout drawer
      closed by an effect on `page.url` instead of `afterNavigate`, `$effect` as `onMount`
      in settings, the range test pushing into a deep `$state` array at 40 Hz.
- [ ] **D09 · `db.ts` carries pure logic and imports client presentation modules.**
      `calculateStreak` into `days.ts`; `CATEGORY_ORDER` and `DEFAULT_TARGET_RANGE` into a
      dependency-free `constants.ts`.
- [ ] **D10 / E14 · Client-side duplication.** Four date formatters (three hard-wired to
      `en-US`), two delete flows, six `fetch` decoders, and `scripts/import.ts`
      re-implementing the CLI's import branch. `src/lib/format.ts`, a small
      `src/lib/api.ts`, and `bun src/cli.ts import`.
- [ ] **E10 · Discard has no confirmation; the two delete confirms disagree; no undo.**
      `RecordingStudio.svelte:100-106`, `sessions/+page.svelte:30`.
- [ ] **E11 · State changes are not announced.** `role="status"` on saved and recording
      indicators, `role="alert"` on error boxes; the timer stays out of any live region.
- [ ] **E12 · No reduced-motion handling; the exercise-card animation classes are dead.**
      `motion-reduce:` variants on the pulsing dot and card lift; the `tailwindcss-animate`
      classes in `exercises/+page.svelte:185` compile to nothing.
- [ ] **E13 · Canvas text below AA; the trend chart has no fallback content.**
      `PitchTrendChart.svelte:227,239,276`, `PitchVisualizer.svelte:177-185`.
- [ ] **E15 · Small semantics.** `aria-expanded` on the instructions toggle, `aria-hidden`
      on decorative emoji, readable disabled-but-informative labels.
- [ ] **A12 · `revive()` and the practice wire shape are typed as if JSON carried
      `Date`s.** Move `JsonDate<T>` from `import.ts` into `types.ts` and use it on both sides.
- [ ] **A13 · Strictness gaps.** `noUncheckedIndexedAccess`, a discriminated `CliArgs`
      union, validated search params on the exercises page, no `selected!` in NoteKeyboard.
- [ ] **A14 · "Total Practice Time" excludes routine time while the streak includes it.**
      `db.ts:843,845`. Sum step seconds from `practice_days`, or show both numbers.
- [ ] **D12 · UTC dates in audio keys and the export file name.** `audio.ts:30`,
      `exportLayout.ts:62`. Everything else is local-day; use `localDayKey`.
- [ ] **B06 · Release supply chain.** Pin actions to SHAs, `permissions: contents: read`
      on CI, an exact Bun patch instead of `1.4.x`, and build provenance attestation.
- [ ] **History page.** The strip shows two weeks; a `/practice/history` page with
      per-step times and the takes of each day is the natural next step once there
      is a month of data to look at.
- [ ] **Step clock counts visible time whether or not you are practising.** Good enough
      for one user who knows that; if it ever matters, drop time while the recorder is idle
      for more than a few minutes.

## Docs & drift

- [ ] **C03 · The store's confidence gate can never fire.** `recorder.svelte.ts:106-113`.
      YIN only reports lags below the 0.2 threshold, so confidence is always > 0.8 and the
      0.55 check (and its comment) is dead. Delete it or make it real.
- [ ] **C09 · The background-tab comment in the detector is wrong.**
      `pitchDetector.ts:159-161`. Browsers throttle `setInterval` to 1 Hz when hidden, so
      the pitch track thins to one point a second. Correct the comment, or capture frames
      in an `AudioWorkletNode`.
- [ ] **C11 · YIN tests assert ±0.5 %, not cents, and the noise test is vacuous.**
      `yin.test.ts:35-39,73-76`. Assert cents, `hz === 0` on noise, add vibrato and
      weak-fundamental cases.
- [ ] **A11 · The `?day=&step=` record flow is dead code.** Nothing links to it; the
      practice page attaches takes through `onSaved`. Remove the prop, the form fields and
      the server attach block, or link it and test it.
- [ ] **D11 / E20 · Stale comments.** `config.ts:8-9` (the flag landed in `cli.ts`),
      `range-test/+page.svelte:21-22` (the hop is 40 Hz, not 60 fps), `bunfig.toml:15`.
- [ ] **B07 · README recommends `HOST_HEADER`, which turns the host check off.**
      `README.md:106-108`. With Caddy, `ORIGIN` alone is enough; say what the header costs.
- [ ] **B08 · No engine pin, no dependency bot, from-source runtime needs devDependencies.**
      `engines` and `packageManager` in `package.json`, a `dependabot.yml`, and one README
      sentence that from-source needs a full `bun install`.
- [ ] **E18 · LICENSE has no copyright holder.** `LICENSE:3`, plus `author` in `package.json`.
- [ ] **E21 · `--help` and README drift.** `ORIGIN` and `BODY_SIZE_LIMIT` on the `--help`
      env line; "60–90 MB depending on platform"; mention `$XDG_DATA_HOME`.
- [ ] **E22 · No changelog, no contributing guidance.** A `CHANGELOG.md` the release job
      reads the top section of; a five-line `CONTRIBUTING.md`.

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
