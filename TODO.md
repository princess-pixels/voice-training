# TODO

Open items, grouped by area and roughly in the order they are worth doing. Each says
where it lives and why it matters, so it can be picked up cold. The dev log, audit
scores and the decisions behind the bigger changes are in [HISTORY.md](HISTORY.md).

State as of 2026-09-21: the round 3 audit scored 7.0 (Sept 3: 6.1). Its ids (A = correctness
and types, B = security and deps, C = DSP and performance, D = architecture and testing,
E = UX and docs) are kept below so a fix can name what it closes. The import trust
boundary (B01, B02, B04), the midnight rollover (A01, A02), dangling take ids after a
delete (A04), the missing error page (D04, E08), the pitch line drawn across silences
(C01), page titles (E09), the README's first-run sentence (E17), the sessions table on
phones (E01), the shared validation module (D01, A05, A06) and the one error-handling
strategy per route (D05), the midnight-safe dashboard tests and per-install export
sweep (D07), the three stale comments (D11, E20), keyboard focus through a take (E02)
plain-language microphone errors (E04, E07), the practice page's step rail, failed-save
handling, history window and review-after-completion (E03, A07, A09, A10), the quiet
cents announcer (E05), live regions on state and error messages (E11), the YIN octave
check (C04) and row-before-file ordering on delete (A08) are already closed. Every bug
from the round is closed; what is left is glow-ups and docs. Of those, pitch labels tied
to the user's own range (E06, E16), YIN reading the newest part of the frame (C02),
routine time in the practice total (A14) and local dates in audio keys and export names
(D12), the end-to-end server test and the coverage-gap script (D03, D02), the audio
route's narrow query (C06), pure logic and constants out of db.ts (D09), reduced motion,
canvas contrast and the small semantics (E12, E13, E15) and the docs fixes (B07, B08,
E18, E21) are done.

## Glow-ups

- [ ] **D06 · Tested pure helpers are dead; the pages reimplement them.**
      `nextStepIndex`, `isPracticed`, `getAudioDevices`, and a third hand-rolled
      `PracticeDay` reviver. A client-safe `src/lib/practice.ts` next to `days.ts`.
- [ ] **B03 · `GET /api/export` builds the whole library on disk for any cross-origin
      request.** Make it a POST (so the origin check applies) or require a custom header;
      cap concurrent exports to one.
- [ ] **C05 · Pitch points are stored at 74 bytes each with a field nothing reads.**
      Round `t` to 1 ms and `hz` to 0.1 Hz in `addPoint`, make `confidence` optional:
      1.7 MB → 0.6 MB per ten-minute take, through upload, SQLite, page payload and export.
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
- [ ] **D10 / E14 · Client-side duplication.** Four date formatters (three hard-wired to
      `en-US`), two delete flows, six `fetch` decoders, and `scripts/import.ts`
      re-implementing the CLI's import branch. `src/lib/format.ts`, a small
      `src/lib/api.ts`, and `bun src/cli.ts import`.
- [ ] **E10 · Discard has no confirmation; the two delete confirms disagree; no undo.**
      `RecordingStudio.svelte:100-106`, `sessions/+page.svelte:30`.
- [ ] **A12 · `revive()` and the practice wire shape are typed as if JSON carried
      `Date`s.** Move `JsonDate<T>` from `import.ts` into `types.ts` and use it on both sides.
- [ ] **A13 · Strictness gaps.** `noUncheckedIndexedAccess`, a discriminated `CliArgs`
      union, validated search params on the exercises page, no `selected!` in NoteKeyboard.
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
