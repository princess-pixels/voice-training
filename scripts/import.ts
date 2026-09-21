/**
 * bun run import <archive.tar.gz>
 *
 * The CLI's `import` command with the development default of ./data (the
 * binary defaults to the user data folder). Same code path as
 * `voice-training import`, so the two cannot drift.
 */
process.env.DATA_DIR ??= 'data';
process.argv.splice(2, 0, 'import');
const { run } = await import('../src/cli');
await run(() => Promise.reject(new Error('import does not start the server')));
