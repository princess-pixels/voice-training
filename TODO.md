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
E18, E21), the export as a same-origin POST (B03), the dead record flow (A11), the YIN
tests in cents with the dead confidence gate and the tab comment (C03, C09, C11) and the
changelog and contributing guide (E22), the shared formatters and API helper with the
import script folded into the CLI (D10, E14), the dead helpers and third reviver (D06,
A12), the confirms and focus after delete (E10) and the cached playback points (C07) and the pinned, attested release pipeline (B06) and the median as the headline pitch (C10) and the cached background with frame-coalesced
live redraws (C08) are done. D08 and A13 are deliberately left for the release after 1.2.0.

## Glow-ups

- [ ] **C05 · Pitch points are stored at 74 bytes each with a field nothing reads.**
      Round `t` to 1 ms and `hz` to 0.1 Hz in `addPoint`, make `confidence` optional:
      1.7 MB → 0.6 MB per ten-minute take, through upload, SQLite, page payload and export.
- [ ] **D08 · Svelte 5 idiom slips.** `busy` derived in an `$effect`, the layout drawer
      closed by an effect on `page.url` instead of `afterNavigate`, `$effect` as `onMount`
      in settings, the range test pushing into a deep `$state` array at 40 Hz.
- [ ] **A13 · Strictness gaps.** `noUncheckedIndexedAccess`, a discriminated `CliArgs`
      union, validated search params on the exercises page, no `selected!` in NoteKeyboard.
- [ ] **History page.** The strip shows two weeks; a `/practice/history` page with
      per-step times and the takes of each day is the natural next step once there
      is a month of data to look at.
- [ ] **Step clock counts visible time whether or not you are practising.** Good enough
      for one user who knows that; if it ever matters, drop time while the recorder is idle
      for more than a few minutes.

## Docs & drift

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
