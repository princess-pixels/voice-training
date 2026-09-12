import { describe, expect, test } from 'bun:test';
import {
	CliError,
	openerCommand,
	parseCliArgs,
	parsePort,
	platformDataDir,
	resolveRuntime,
	type RuntimeContext
} from './cli';

describe('parseCliArgs', () => {
	test('no arguments serves with everything left to the environment', () => {
		expect(parseCliArgs([])).toEqual({ command: 'serve' });
	});

	test('reads every option', () => {
		expect(
			parseCliArgs(['--data-dir', '/x', '--port', '8080', '--host', '0.0.0.0', '--open'])
		).toEqual({
			command: 'serve',
			dataDir: '/x',
			port: 8080,
			host: '0.0.0.0',
			open: true
		});
		expect(parseCliArgs(['--no-open']).open).toBe(false);
		expect(parseCliArgs(['--open', '--no-open']).open).toBe(false);
	});

	test('help and version win over everything else', () => {
		expect(parseCliArgs(['-h'])).toEqual({ command: 'help' });
		expect(parseCliArgs(['--help', '--port', 'nope'])).toEqual({ command: 'help' });
		expect(parseCliArgs(['-v'])).toEqual({ command: 'version' });
	});

	test('import takes an archive and the data dir', () => {
		expect(parseCliArgs(['import', 'a.tar.gz', '--data-dir', '/d'])).toEqual({
			command: 'import',
			archive: 'a.tar.gz',
			dataDir: '/d'
		});
	});

	test('rejects what it does not understand, with a CliError', () => {
		const bad = (argv: string[], message: RegExp) =>
			expect(() => parseCliArgs(argv)).toThrow(
				expect.objectContaining({ message: expect.stringMatching(message) })
			);
		bad(['--port', 'abc'], /Invalid port: abc/);
		bad(['--port', '0'], /Invalid port/);
		bad(['--port', '70000'], /Invalid port/);
		bad(['--data-dir', ' '], /--data-dir needs a directory/);
		bad(['--host', ''], /--host needs an address/);
		bad(['--bogus'], /Unknown option/);
		bad(['import'], /import needs the path/);
		bad(['import', 'a', 'b'], /Unexpected argument: b/);
		bad(['dance'], /Unknown command: dance/);
		expect(() => parseCliArgs(['dance'])).toThrow(CliError);
	});
});

describe('platformDataDir', () => {
	test('follows each platform convention', () => {
		expect(platformDataDir('linux', {}, '/home/m')).toBe('/home/m/.local/share/voice-training');
		expect(platformDataDir('linux', { XDG_DATA_HOME: '/data' }, '/home/m')).toBe(
			'/data/voice-training'
		);
		expect(platformDataDir('darwin', {}, '/Users/m')).toBe(
			'/Users/m/Library/Application Support/voice-training'
		);
		expect(
			platformDataDir('win32', { APPDATA: 'C:\\Users\\m\\AppData\\Roaming' }, 'C:\\Users\\m')
		).toMatch(/Roaming[\\/]voice-training$/);
		expect(platformDataDir('win32', {}, 'C:\\Users\\m')).toMatch(
			/AppData[\\/]Roaming[\\/]voice-training$/
		);
		expect(platformDataDir('freebsd', {}, '/home/m')).toBe('/home/m/.local/share/voice-training');
	});
});

describe('resolveRuntime', () => {
	const ctx = (over: Partial<RuntimeContext> = {}): RuntimeContext => ({
		platform: 'linux',
		env: {},
		home: '/home/m',
		standalone: true,
		...over
	});

	test('defaults suit a double-clicked binary', () => {
		expect(resolveRuntime({ command: 'serve' }, ctx())).toEqual({
			dataDir: '/home/m/.local/share/voice-training',
			port: 3000,
			host: '127.0.0.1',
			origin: 'http://localhost:3000',
			bodySizeLimit: '64M',
			open: true,
			url: 'http://localhost:3000/'
		});
	});

	test('environment fills in, options win', () => {
		const env = {
			DATA_DIR: '/srv/vt',
			PORT: '3002',
			HOST: '0.0.0.0',
			ORIGIN: 'https://voice.mia',
			BODY_SIZE_LIMIT: '128M',
			OPEN: '0'
		};
		expect(resolveRuntime({ command: 'serve' }, ctx({ env }))).toEqual({
			dataDir: '/srv/vt',
			port: 3002,
			host: '0.0.0.0',
			origin: 'https://voice.mia',
			bodySizeLimit: '128M',
			open: false,
			url: 'http://localhost:3002/'
		});
		const r = resolveRuntime(
			{ command: 'serve', dataDir: '/x', port: 4000, host: '::1', open: true },
			ctx({ env })
		);
		expect(r).toMatchObject({
			dataDir: '/x',
			port: 4000,
			host: '::1',
			open: true,
			url: 'http://localhost:4000/'
		});
		// ORIGIN from the environment is kept even when the port option changes.
		expect(r.origin).toBe('https://voice.mia');
	});

	test('open defaults to off outside the binary, and OPEN accepts the usual spellings', () => {
		expect(resolveRuntime({ command: 'serve' }, ctx({ standalone: false })).open).toBe(false);
		for (const v of ['1', 'true', 'yes', 'anything']) {
			expect(resolveRuntime({ command: 'serve' }, ctx({ env: { OPEN: v } })).open).toBe(true);
		}
		for (const v of ['0', 'false', 'NO']) {
			expect(resolveRuntime({ command: 'serve' }, ctx({ env: { OPEN: v } })).open).toBe(false);
		}
		expect(() => resolveRuntime({ command: 'serve' }, ctx({ env: { PORT: 'x' } }))).toThrow(
			/Invalid port/
		);
	});
});

describe('openerCommand', () => {
	test('names the platform opener', () => {
		expect(openerCommand('linux', 'u')).toEqual(['xdg-open', 'u']);
		expect(openerCommand('freebsd', 'u')).toEqual(['xdg-open', 'u']);
		expect(openerCommand('darwin', 'u')).toEqual(['open', 'u']);
		expect(openerCommand('win32', 'u')).toEqual(['cmd', '/c', 'start', '', 'u']);
		expect(openerCommand('aix', 'u')).toBeNull();
		expect(parsePort('65535')).toBe(65535);
	});
});
