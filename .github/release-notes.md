One file, no install. Download the build for your machine, unpack it, run it, and the app opens in your browser at http://localhost:3000. Your data goes to your user data folder; `voice-training --help` lists the options.

| Platform                                   | File                                        |
| ------------------------------------------ | ------------------------------------------- |
| Linux x64                                  | `voice-training-linux-x64.tar.gz`           |
| Linux arm64 (Raspberry Pi 4/5 and similar) | `voice-training-linux-arm64.tar.gz`         |
| macOS Apple silicon (M1, M2, M3, …)        | `voice-training-macos-apple-silicon.tar.gz` |
| macOS Intel                                | `voice-training-macos-intel.tar.gz`         |
| Windows x64                                | `voice-training-windows-x64.zip`            |

The binaries are not code-signed. macOS 15 and later: double-click once and let it be blocked, then choose **Open Anyway** under System Settings → Privacy & Security (or run `xattr -d com.apple.quarantine` on the unpacked file); details in the [README](https://github.com/princess-pixels/voice-training#first-start-on-macos). Windows: on the SmartScreen prompt choose "More info", then "Run anyway". `SHA256SUMS.txt` lets you verify a download.
