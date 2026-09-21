import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

let dir: string;

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), 'voice-training-audio-test-'));
	process.env.DATA_DIR = dir;
});

afterAll(async () => {
	delete process.env.DATA_DIR;
	await rm(dir, { recursive: true, force: true });
});

// Imported lazily so DATA_DIR is set before the module reads it.
const audio = () => import('./audio');

async function bytes(stream: ReadableStream): Promise<Uint8Array> {
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe('audioExtension / audioTypeForKey', () => {
	test('round-trips the three browser encodings', async () => {
		const { audioExtension, audioTypeForKey } = await audio();
		expect(audioExtension('audio/webm;codecs=opus')).toBe('webm');
		expect(audioExtension('audio/mp4')).toBe('m4a');
		expect(audioExtension('audio/ogg')).toBe('ogg');
		expect(audioExtension()).toBe('webm');
		expect(audioTypeForKey('a/b.m4a')).toBe('audio/mp4');
		expect(audioTypeForKey('a/b.ogg')).toBe('audio/ogg');
		expect(audioTypeForKey('a/b.webm')).toBe('audio/webm');
		expect(audioTypeForKey('placeholder-audio-key')).toBe('audio/webm');
	});
});

describe('generateAudioKey', () => {
	test('is dated, per session, and safe', async () => {
		const { generateAudioKey, isSafeAudioKey } = await audio();
		const key = generateAudioKey('temp-1', 'audio/mp4');
		expect(key).toMatch(/^sessions\/\d{4}-\d{2}-\d{2}\/temp-1\/[0-9a-f-]{36}\.m4a$/);
		expect(isSafeAudioKey(key)).toBe(true);
	});
});

describe('isSafeAudioKey', () => {
	test('refuses anything that could leave the audio directory', async () => {
		const { isSafeAudioKey } = await audio();
		expect(isSafeAudioKey('')).toBe(false);
		expect(isSafeAudioKey('/etc/passwd')).toBe(false);
		expect(isSafeAudioKey('../x.webm')).toBe(false);
		expect(isSafeAudioKey('a/../../x.webm')).toBe(false);
		expect(isSafeAudioKey('a/./x.webm')).toBe(false);
		expect(isSafeAudioKey('a//x.webm')).toBe(false);
		expect(isSafeAudioKey('a\\x.webm')).toBe(false);
		expect(isSafeAudioKey('a/x y.webm')).toBe(false);
		expect(isSafeAudioKey('x'.repeat(513))).toBe(false);
		expect(isSafeAudioKey('placeholder-audio-key')).toBe(true);
	});

	test('uploadAudio throws on an unsafe key rather than writing', async () => {
		const { uploadAudio } = await audio();
		await expect(uploadAudio('../escape.webm', new Uint8Array([1]), 'audio/webm')).rejects.toThrow(
			/unsafe audio key/
		);
	});
});

describe('upload, open, download, delete', () => {
	const payload = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

	test('writes under the audio root and streams whole or by range', async () => {
		const { audioRoot, ensureAudioDir, generateAudioKey, openAudio, uploadAudio } = await audio();
		await ensureAudioDir();
		expect(audioRoot()).toBe(join(dir, 'audio'));

		const key = generateAudioKey('s1', 'audio/webm');
		expect(await uploadAudio(key, payload, 'audio/webm')).toBe(key);
		expect(await readdir(join(dir, 'audio', 'sessions'))).toHaveLength(1);

		const opened = await openAudio(key);
		expect(opened).not.toBeNull();
		expect(opened!.size).toBe(10);
		expect(opened!.type).toBe('audio/webm');
		expect(await bytes(opened!.stream())).toEqual(payload);
		expect(await bytes(opened!.stream(2, 4))).toEqual(new Uint8Array([2, 3, 4]));
		expect(await bytes(opened!.stream(7))).toEqual(new Uint8Array([7, 8, 9]));
	});

	test('downloads to a path and reports a missing file', async () => {
		const { downloadAudio, generateAudioKey, uploadAudio } = await audio();
		const key = generateAudioKey('s2', 'audio/mp4');
		await uploadAudio(key, payload, 'audio/mp4');

		const to = join(dir, 'copy.m4a');
		expect(await downloadAudio(key, to)).toBe(true);
		expect(new Uint8Array(await Bun.file(to).arrayBuffer())).toEqual(payload);

		expect(await downloadAudio('sessions/2026-01-01/nope/x.m4a', join(dir, 'never'))).toBe(false);
		expect(await downloadAudio('../x', join(dir, 'never'))).toBe(false);
		expect(await Bun.file(join(dir, 'never')).exists()).toBe(false);
	});

	test('missing and placeholder keys open as null', async () => {
		const { openAudio } = await audio();
		expect(await openAudio('placeholder-audio-key')).toBeNull();
		expect(await openAudio('sessions')).toBeNull(); // a directory, not a file
		expect(await openAudio('../x')).toBeNull();
	});

	test('delete removes the file and tolerates absent or unsafe keys', async () => {
		const { audioRoot, deleteAudio, generateAudioKey, openAudio, uploadAudio } = await audio();
		const key = generateAudioKey('s3', 'audio/ogg');
		await uploadAudio(key, payload, 'audio/ogg');
		const sessionDir = join(audioRoot(), dirname(key));
		expect((await stat(sessionDir)).isDirectory()).toBe(true);
		await deleteAudio(key);
		expect(await openAudio(key)).toBeNull();
		// The per-session directory is gone with it; the date directory stays.
		await expect(stat(sessionDir)).rejects.toThrow();
		expect((await stat(dirname(sessionDir))).isDirectory()).toBe(true);
		await deleteAudio(key);
		await deleteAudio('placeholder-audio-key');
		await deleteAudio('../x');
	});
});
