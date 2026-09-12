# Voice Training

[![CI](https://github.com/princess-pixels/voice-training/actions/workflows/ci.yml/badge.svg)](https://github.com/princess-pixels/voice-training/actions/workflows/ci.yml)

A feminization voice practice app that runs on your own machine: a guided daily routine,
a recording studio with live pitch, a range test, and progress over time. One file to
download, nothing to install, and every recording stays on your disk.

> 💜 This is a personal project, published for anyone who finds it useful. **No support is
> guaranteed.** I built it for myself and share it in case it helps others. Issues and PRs
> are welcome but may not be promptly addressed.

## Get it running

1. Download the build for your machine from the
   [releases page](https://github.com/princess-pixels/voice-training/releases) and unpack it.

   | Platform                                   | File                                 |
   | ------------------------------------------ | ------------------------------------ |
   | Linux x64                                  | `voice-training-linux-x64.tar.gz`    |
   | Linux arm64 (Raspberry Pi 4/5 and similar) | `voice-training-linux-arm64.tar.gz`  |
   | macOS Apple silicon                        | `voice-training-darwin-arm64.tar.gz` |
   | macOS Intel                                | `voice-training-darwin-x64.tar.gz`   |
   | Windows x64                                | `voice-training-windows-x64.zip`     |

2. Run it: double-click, or from a terminal:

   ```bash
   ./voice-training
   ```

3. Your browser opens on http://localhost:3000. Allow the microphone when asked, and
   you're on Today's Practice.

The binaries are not code-signed, so the first start needs a confirmation: on macOS
right-click the file, choose **Open**, and confirm; on Windows choose **More info**, then
**Run anyway** on the SmartScreen prompt. The file is about 65 MB because it carries its
own runtime; `SHA256SUMS.txt` on the release lets you verify a download.

Your data (a SQLite database and the recordings) lives in your user data folder:
`~/.local/share/voice-training` on Linux, `~/Library/Application Support/voice-training`
on macOS, `%APPDATA%\voice-training` on Windows. `voice-training --help` lists the
options, all of which are in [Configuration](#configuration) below.

## What's inside

- **Today's Practice** — a guided 4-step daily routine (warmup → straw work → technical
  focus → connected speech) that rotates day to day, so opening the app never requires
  deciding what to do. Progress is saved per day: leave for the recorder, reload, or switch
  devices and it picks up where you were, with time spent and recordings attached to each step.
- **Recording studio** — real-time pitch visualization with feminine / androgynous /
  masculine range overlays, then playback with the pitch timeline. Detection is the YIN
  algorithm over the Web Audio API, amplitude-gated and clamped to 70–500 Hz.
- **Reference notes** — a strip of notes around your target range under the graph. Tap one
  to hear it (a short blip, or sustained), it is drawn as a line on the graph, and a cents
  readout says how far sharp or flat you are while you hum. No piano app or tuner needed.
- **Pitch Range Test** — guided lowest→highest comfortable pitch measurement, reported in
  Hz, note names and semitones, charted over time, with full-range and modal-voice series
  kept apart.
- **25 exercises** across 6 categories (warmup, straw/SOVT, pitch, resonance, intonation,
  reading), including semi-occluded vocal tract work and oral-vs-nasal resonance training.
- **Dashboard** with pitch trends, practice streaks, and a category breakdown.
- **Your target range** is configurable with presets and applies everywhere.
- **Everything local.** Recordings are files on your disk; nothing leaves your machine.
- Dark theme with a pink/purple aesthetic.

## Keep it running

For daily use you may want it up all the time rather than started by hand. On a
systemd machine, with the binary at `/opt/voice-training/voice-training`:

```ini
# ~/.config/systemd/user/voice-training.service
[Unit]
Description=Voice Training
After=network.target default.target

[Service]
Type=simple
ExecStart=/opt/voice-training/voice-training --no-open --port 3000
# Environment=DATA_DIR=/srv/voice-training   # if not the user data folder
Restart=on-failure
RestartSec=5s
# Bun doesn't exit on SIGTERM here; without this, stop/restart waits the full 90s default.
KillMode=mixed
TimeoutStopSec=10s

[Install]
WantedBy=default.target
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now voice-training.service
loginctl enable-linger $USER   # so it starts at boot, not just at login
```

Running from a source checkout instead? `bun run build`, then
`ExecStart=/home/you/.bun/bin/bun ./build/index.js` with `WorkingDirectory` set to the
checkout and an `EnvironmentFile` for the settings; see [Configuration](#configuration).

**Reaching it from another device needs HTTPS.** Browsers only allow the microphone on
`localhost` or a secure origin. Bind to your LAN with `--host 0.0.0.0`, put a reverse proxy
with TLS in front (Caddy's `tls internal` is the easiest for a home network), and set
`ORIGIN` to the `https://` URL you open the app at. Without a matching `ORIGIN` the server
rejects uploads with `403 Cross-site POST form submissions are forbidden`. If the proxy
forwards `X-Forwarded-Proto` and `X-Forwarded-Host`, `PROTOCOL_HEADER=x-forwarded-proto`
and `HOST_HEADER=x-forwarded-host` work too.

## Your data

Everything is in the data folder: `voice-training.db` (SQLite) and `audio/` with one
file per recording. Back it up, move it, or point two installs at different folders with
`--data-dir`; there is nothing else.

**Export.** Settings has a **Download everything** button (`GET /api/export`) that packs
the whole library into one `voice-training-export-YYYY-MM-DD.tar.gz`:

```
manifest.json        format, version, export time, settings, exercises,
                     range tests, practice days, and one summary entry per session
sessions/<id>.json   the full session record, pitch points included
audio/<id>.<ext>     the recording (webm, m4a or ogg), if the file still exists
```

Each manifest session entry names its `file` and `audioFile`, so a missing recording shows
as `audioFile: null` rather than a silent gap. The archive is built in a temp directory
with the system `tar` and streamed out; nothing is held in memory, so a large library only
costs disk space while it packs. That archive is also the format to hand to someone else,
a therapist for instance, who can read it with the same app.

**Import.**

```bash
./voice-training import voice-training-export-2026-09-12.tar.gz
```

reads an archive into the data folder (`--data-dir` to choose another). It is additive and
safe to repeat: sessions, range tests and practice days that already exist are skipped,
exercises are matched by title so references keep working across installs, and local
settings are kept if there are any. Stop the server first if it runs against the same folder.

## Scope and security

**There is no authentication.** Anyone who can reach the port can read, record and delete
sessions. The binary binds to `127.0.0.1` by default, so out of the box that is only you.
If you open it to a LAN, put it behind a reverse proxy with TLS; if you expose it further,
add HTTP auth or a forward-auth proxy (Authelia, Caddy `basic_auth`, Tailscale) in front.
The app itself will not stop anyone.

Recordings are streamed through the app from the data folder; the folder is never served
directly, and audio keys are validated so a request cannot reach outside it. Uploads are
capped at 50 MB of audio and 200k pitch points per session, and every session field is
validated server-side. The server sends a nonce-based Content-Security-Policy and the
usual hardening headers, and answers only to `localhost` and the hostname in `ORIGIN`
(any other `Host` header gets a 403), so a web page whose DNS name points at your machine
cannot use the API. With `HOST_HEADER` set, the proxy is trusted to do that instead.

## Configuration

Options beat environment variables, which beat the defaults. A `.env` file in the
directory you start from is read as well.

| Option                | Variable           | Purpose                                                                                           | Default                                          |
| --------------------- | ------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `--data-dir`          | `DATA_DIR`         | Folder for the database and recordings                                                            | user data folder (binary); `./data` (source)     |
| `--port`              | `PORT`             | Port to listen on                                                                                 | `3000`                                           |
| `--host`              | `HOST`             | Address to bind; `0.0.0.0` to share on a LAN                                                      | `127.0.0.1` (binary); `0.0.0.0` (source)         |
| `--open`, `--no-open` | `OPEN=1`, `OPEN=0` | Open the browser once the server is up                                                            | on for the binary, off from source               |
|                       | `ORIGIN`           | URL the app is opened at; must match the browser's origin or uploads get a 403                    | `http://localhost:PORT` (binary); unset (source) |
|                       | `BODY_SIZE_LIMIT`  | Largest request body; must fit a recording plus its pitch points, or the server answers 413 first | `64M` (binary); the adapter's `512K` (source)    |
| `--help`, `--version` |                    |                                                                                                   |                                                  |

The two "source" defaults for `ORIGIN` and `BODY_SIZE_LIMIT` are the ones that bite;
`.env.example` sets both.

## From source

You need [Bun](https://bun.com) 1.4+ (the database is `bun:sqlite`, so Node alone will not
run it). Nothing else: no database server, no object storage, no Docker.

```bash
git clone https://github.com/princess-pixels/voice-training.git
cd voice-training
bun install
cp .env.example .env
bun run dev              # Vite dev server on :5173, data in ./data
```

```bash
bun run check            # svelte-check: types and template errors
bun test                 # YIN, pitch stats, routine, the storage layer (in-memory SQLite,
                         # temp audio dir), export/import round trip; coverage thresholds on
bun run build            # production bundle into ./build; run it with `bun ./build/index.js`
bun run start -- --help  # the CLI entry, in development
bun run build:binary     # dist/voice-training for this machine
bun run build:binary bun-linux-x64 bun-darwin-arm64 bun-windows-x64   # or any Bun target
bun run import <archive> # the importer against ./data (or DATA_DIR)
```

The pitch detector is split so the maths is testable without a browser: `yin.ts` is a pure
function over a sample buffer, `pitchDetector.ts` is the Web Audio wrapper around it. The
storage layer is two modules, `db.ts` and `audio.ts`, and every route goes through them.

Stack: SvelteKit 2 + Svelte 5 (runes), Tailwind CSS v4, `bun:sqlite`, the Web Audio API,
TypeScript. Tagging `vX.Y.Z` (matching `package.json`) builds and publishes the binaries
for every platform through `.github/workflows/release.yml`.

Known rough edges and next steps live in [TODO.md](TODO.md).

```
src/
├── cli.ts              # entry of the binary: options, environment, browser
├── lib/
│   ├── audio/          # YIN (pure) + Web Audio wrapper, pitch stats, note helpers, tests
│   ├── components/     # Svelte components (visualizer, stats, studio)
│   ├── server/         # SQLite storage, audio files, export/import, exercise library, routine
│   ├── stores/         # Svelte 5 rune-based stores
│   ├── categories.ts   # Exercise category labels + colours (single source of truth)
│   └── types.ts        # Shared TypeScript types
├── routes/             # SvelteKit routes (pages + API)
│   ├── practice/       # Today's Practice guided routine
│   ├── range-test/     # Pitch range measurement + history
│   ├── record/         # Recording studio
│   └── sessions/       # Session history and playback
└── hooks.server.ts     # Startup bootstrap (database, data dir, exercise sync)
```

## Troubleshooting

**Nothing opens** after double-clicking the binary
→ Look for a terminal window with the log, or run it from a terminal. On macOS and Windows
the first start is blocked until you confirm it once (see [Get it running](#get-it-running)).

**"Could not open the database"** on startup
→ The data folder isn't writable, or a relative `--data-dir` resolved somewhere you didn't
expect. The log line names the folder.

**Mic not working**
→ The browser blocks mic access over plain HTTP except on `localhost`. From another device
you need HTTPS; see [Keep it running](#keep-it-running).

**Every page says "Host ... is not allowed"**
→ You opened the app at a name or address that is neither `localhost` nor the hostname in
`ORIGIN`. Set `ORIGIN` to the URL you open the app at; see [Keep it running](#keep-it-running).

**Saving a recording fails with 403 or 413**
→ 403: `ORIGIN` does not match the URL in your browser. 413: `BODY_SIZE_LIMIT` is too small
for the recording. Both have working defaults in the binary and need setting from source.

**Pitch visualizer shows nothing**
→ Make sure you granted mic permission in the browser address bar. Also check your OS mic
input level is high enough; soft speakers may need to speak closer to the mic.

**Pitch graph looks jittery / spikes wildly**
→ Try a different mic, or reduce background noise. The detector has an amplitude gate but
very noisy environments can still confuse YIN.

## License

MIT
