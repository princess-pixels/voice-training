One file, no install. Download the build for your machine, unpack it, run it, and the app opens in your browser at http://localhost:3000. Your data goes to your user data folder; `voice-training --help` lists the options.

| Platform                                   | File                                 |
| ------------------------------------------ | ------------------------------------ |
| Linux x64                                  | `voice-training-linux-x64.tar.gz`    |
| Linux arm64 (Raspberry Pi 4/5 and similar) | `voice-training-linux-arm64.tar.gz`  |
| macOS Apple silicon                        | `voice-training-darwin-arm64.tar.gz` |
| macOS Intel                                | `voice-training-darwin-x64.tar.gz`   |
| Windows x64                                | `voice-training-windows-x64.zip`     |

The binaries are not code-signed. macOS: right-click the file, choose Open, and confirm once. Windows: on the SmartScreen prompt choose "More info", then "Run anyway". `SHA256SUMS.txt` lets you verify a download.
