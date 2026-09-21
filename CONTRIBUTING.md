# Contributing

Issues and pull requests are welcome. Before opening a PR:

1. `bun install`, then `bun run lint`, `bun run check` and `bun test` all pass (CI runs
   exactly these, then builds and runs `bun run test:server` against the build).
2. New behaviour has a test next to it; a bug fix has a test that fails without it.
3. Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) if a user would notice.
4. Keep commits focused and say _why_ in the message; the _what_ is in the diff.

Anything larger than a fix is worth an issue first, so the shape can be agreed before
the work. [TODO.md](TODO.md) lists what is known to be open.
