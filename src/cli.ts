/**
 * The portable binary's entry (and `bun src/cli.ts` in development). Reads the
 * command line, sets the environment the SvelteKit server expects, then loads
 * the adapter's server, which starts listening on import.
 *
 * The server bundle (build/index.js) exists only after `bun run build`, so it
 * is handed in by the caller: scripts/build-binary.ts generates a two-line
 * wrapper in build/ that imports it statically (so the compiler bundles it),
 * and the dev entry at the bottom loads it from disk.
 */
import { resolve } from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import {
	CliError,
	USAGE,
	openerCommand,
	parseCliArgs,
	resolveRuntime,
	type Runtime
} from './lib/server/cli';

export async function run(loadServer: () => Promise<unknown>): Promise<void> {
	try {
		await main(loadServer);
	} catch (err) {
		if (err instanceof CliError) {
			console.error(err.message);
			console.error(`\n${USAGE}`);
			process.exit(2);
		}
		throw err;
	}
}

async function main(loadServer: () => Promise<unknown>): Promise<void> {
	const args = parseCliArgs(process.argv.slice(2));
	if (args.command === 'help') return console.log(USAGE);
	if (args.command === 'version') return console.log(`voice-training ${pkg.version}`);

	const runtime = resolveRuntime(args, {
		platform: process.platform,
		env: process.env,
		home: process.env.HOME ?? process.env.USERPROFILE ?? '.',
		standalone: Bun.isStandaloneExecutable
	});
	process.env.DATA_DIR = runtime.dataDir;

	if (args.command === 'import') {
		const { formatReport, importArchive } = await import('./lib/server/import');
		const { closeDatabase } = await import('./lib/server/db');
		console.log(`Importing ${args.archive} into ${runtime.dataDir}`);
		try {
			const report = await importArchive(args.archive!);
			console.log(formatReport(report));
			process.exitCode = report.sessions.failed.length > 0 ? 1 : 0;
		} catch (err) {
			// A missing or broken archive is a message, not a stack trace.
			console.error(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
			process.exitCode = 1;
		} finally {
			closeDatabase();
		}
		return;
	}

	process.env.PORT = String(runtime.port);
	process.env.HOST = runtime.host;
	process.env.ORIGIN = runtime.origin;
	process.env.BODY_SIZE_LIMIT = runtime.bodySizeLimit;

	console.log(`voice-training ${pkg.version}`);
	console.log(`  data     ${runtime.dataDir}`);
	console.log(`  url      ${runtime.url}`);
	if (runtime.host !== '127.0.0.1' && runtime.host !== 'localhost') {
		console.log(
			`  bound to ${runtime.host}; browsers need https (or localhost) for the microphone`
		);
	}

	// The adapter's entry starts listening as a side effect of being imported.
	await loadServer();

	if (runtime.open) await openBrowser(runtime);
}

async function openBrowser(runtime: Runtime): Promise<void> {
	const ready = await waitForServer(runtime.url);
	if (!ready)
		return console.warn(`  the server did not answer in time; open ${runtime.url} yourself`);
	const cmd = openerCommand(process.platform, runtime.url);
	if (!cmd || !Bun.which(cmd[0])) return console.log(`  open ${runtime.url} in your browser`);
	try {
		Bun.spawn(cmd, { stdout: 'ignore', stderr: 'ignore' }).unref();
	} catch {
		console.log(`  open ${runtime.url} in your browser`);
	}
}

async function waitForServer(url: string, attempts = 50): Promise<boolean> {
	for (let i = 0; i < attempts; i++) {
		try {
			const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(1000) });
			if (res.ok) return true;
		} catch {
			// not up yet
		}
		await Bun.sleep(100);
	}
	return false;
}

if (import.meta.main) {
	const entry = resolve('build/index.js');
	await run(() => import(entry));
}
