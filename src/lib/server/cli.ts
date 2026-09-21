import { parseArgs } from 'node:util';
import { join } from 'node:path';

/**
 * The portable binary's command line, as pure functions: parse the arguments,
 * decide the environment the server starts with, name the browser opener.
 * src/cli.ts is the thin entry that acts on them.
 */

export interface CliArgs {
	command: 'serve' | 'import' | 'help' | 'version';
	dataDir?: string;
	port?: number;
	host?: string;
	/** undefined = decide by context (see resolveRuntime). */
	open?: boolean;
	/** For `import`. */
	archive?: string;
}

export const USAGE = `voice-training [options]
voice-training import <archive.tar.gz> [--data-dir DIR]

Runs the app on this machine and opens it in your browser.

Options
  --data-dir DIR   where the database and recordings live
                   (default: your user data folder, see below)
  --port PORT      port to listen on (default: 3000)
  --host HOST      address to bind (default: 127.0.0.1, this machine only;
                   0.0.0.0 to share on your LAN, then use https and ORIGIN)
  --open           open the browser once the server is up (default when
                   started by double-click or from a terminal)
  --no-open        do not open a browser (for services)
  --help           this text
  --version        print the version

Every option has an environment variable: DATA_DIR, PORT, HOST, OPEN=0|1.
Behind a proxy or on a LAN also set ORIGIN (the URL you open the app at)
and, for long recordings, BODY_SIZE_LIMIT (default 64M). A .env file next
to where you start it is read too. Options win over both.

Data folder defaults
  Linux    $XDG_DATA_HOME/voice-training or ~/.local/share/voice-training
  macOS    ~/Library/Application Support/voice-training
  Windows  %APPDATA%\\voice-training`;

export class CliError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CliError';
	}
}

export function parseCliArgs(argv: string[]): CliArgs {
	let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>;
	try {
		parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
	} catch (err) {
		throw new CliError((err as Error).message);
	}
	const { values, positionals } = parsed;

	if (values.help) return { command: 'help' };
	if (values.version) return { command: 'version' };

	const args: CliArgs = { command: 'serve' };
	if (values['data-dir'] !== undefined) {
		if (!values['data-dir'].trim()) throw new CliError('--data-dir needs a directory');
		args.dataDir = values['data-dir'];
	}
	if (values.port !== undefined) args.port = parsePort(values.port);
	if (values.host !== undefined) {
		if (!values.host.trim()) throw new CliError('--host needs an address');
		args.host = values.host;
	}
	if (values.open) args.open = true;
	if (values['no-open']) args.open = false;

	const [command, ...rest] = positionals;
	if (command === undefined) return args;
	if (command === 'import') {
		const [archive, ...extra] = rest;
		if (!archive) throw new CliError('import needs the path to an export archive');
		if (extra.length) throw new CliError(`Unexpected argument: ${extra[0]}`);
		return { ...args, command: 'import', archive };
	}
	throw new CliError(`Unknown command: ${command}`);
}

const OPTIONS = {
	'data-dir': { type: 'string' },
	port: { type: 'string' },
	host: { type: 'string' },
	open: { type: 'boolean' },
	'no-open': { type: 'boolean' },
	help: { type: 'boolean', short: 'h' },
	version: { type: 'boolean', short: 'v' }
} as const;

export function parsePort(value: string): number {
	const port = Number(value);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new CliError(`Invalid port: ${value}`);
	}
	return port;
}

/** The per-user data folder for this platform. */
export function platformDataDir(
	platform: NodeJS.Platform,
	env: Record<string, string | undefined>,
	home: string
): string {
	const app = 'voice-training';
	if (platform === 'win32') return join(env.APPDATA || join(home, 'AppData', 'Roaming'), app);
	if (platform === 'darwin') return join(home, 'Library', 'Application Support', app);
	return join(env.XDG_DATA_HOME || join(home, '.local', 'share'), app);
}

export interface RuntimeContext {
	platform: NodeJS.Platform;
	env: Record<string, string | undefined>;
	home: string;
	/** True inside a `bun build --compile` binary. */
	standalone: boolean;
}

export interface Runtime {
	dataDir: string;
	port: number;
	host: string;
	origin: string;
	bodySizeLimit: string;
	open: boolean;
	/** The URL to open and print; localhost so the browser treats it as a secure origin. */
	url: string;
}

/**
 * Options beat environment beats defaults. ORIGIN and BODY_SIZE_LIMIT are the
 * two settings the audit found every hosted install got wrong at least once;
 * here they default to values that work for a local binary and can still be
 * set for a proxy.
 */
export function resolveRuntime(args: CliArgs, ctx: RuntimeContext): Runtime {
	const port = args.port ?? (ctx.env.PORT ? parsePort(ctx.env.PORT) : 3000);
	const host = args.host ?? ctx.env.HOST ?? '127.0.0.1';
	const url = `http://localhost:${port}/`;
	const envOpen = ctx.env.OPEN === undefined ? undefined : !/^(0|false|no)$/i.test(ctx.env.OPEN);
	return {
		dataDir: args.dataDir ?? ctx.env.DATA_DIR ?? platformDataDir(ctx.platform, ctx.env, ctx.home),
		port,
		host,
		origin: ctx.env.ORIGIN ?? `http://localhost:${port}`,
		bodySizeLimit: ctx.env.BODY_SIZE_LIMIT ?? '64M',
		// A double-clicked binary has nobody to tell it; a `bun src/cli.ts` in a
		// terminal is a developer who can type the URL.
		open: args.open ?? envOpen ?? ctx.standalone,
		url
	};
}

/** The command that opens a URL in the default browser, or null if unknown. */
export function openerCommand(platform: NodeJS.Platform, url: string): string[] | null {
	if (platform === 'darwin') return ['open', url];
	if (platform === 'win32') return ['cmd', '/c', 'start', '', url];
	if (platform === 'linux' || platform === 'freebsd') return ['xdg-open', url];
	return null;
}
