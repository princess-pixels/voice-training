import { afterAll, afterEach, beforeAll, describe, expect, spyOn, test } from 'bun:test';
import { mkdir, mkdtemp, rm, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Exercise, PracticeDay, Session } from '$lib/types';

let root: string;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'voice-training-import-test-'));
});

afterAll(async () => {
	delete process.env.DATA_DIR;
	await rm(root, { recursive: true, force: true });
});

const db = () => import('./db');
const audio = () => import('./audio');
const imp = () => import('./import');
const exp = () => import('./export');

let n = 0;
/** A fresh, empty data directory as the current DATA_DIR. */
async function freshDataDir(): Promise<string> {
	const { closeDatabase } = await db();
	closeDatabase();
	const dir = join(root, `data-${n++}`);
	process.env.DATA_DIR = dir;
	return dir;
}

afterEach(async () => {
	(await db()).closeDatabase();
});

const OLD_EX_A = '6a9886eb5c484718d059a056';
const OLD_EX_B = '6a9886eb5c484718d059a057';
const SESSION_1 = '6a99d69c6610f1d1a26d08a6';
const SESSION_2 = '6a99e01e3d67ca9e4010b3c0';
const SESSION_3 = '6a99e01e3d67ca9e4010b3c1';
const RANGE_1 = '6a99f0000000000000000001';

function exercise(id: string, title: string): Exercise {
	return {
		_id: id,
		category: 'warmup',
		title,
		description: 'd',
		instructions: 'i',
		estimatedMinutes: 2,
		difficulty: 'beginner'
	};
}

function session(id: string, exerciseId: string | null, audioKey: string, createdAt: string) {
	return {
		_id: id,
		exerciseId,
		title: `Take ${id.slice(-2)}`,
		audioKey,
		audioType: 'audio/webm;codecs=opus',
		duration: 30,
		pitchData: {
			points: [
				{ t: 0, hz: 200, confidence: 0.9 },
				{ t: 0.025, hz: 210, confidence: 0.9 }
			],
			avgPitch: 205,
			minPitch: 200,
			maxPitch: 210,
			timeInTargetPct: 100
		},
		targetRange: { low: 180, high: 300 },
		notes: '',
		createdAt
	};
}

/**
 * Writes a v2 archive directory the way the exporter lays it out, with the
 * awkward cases: an exercise this install also seeds (matched by title), one it
 * does not (added under its old id), a session whose audio is missing, a session
 * whose file is missing, and one with no audio at all.
 */
async function writeFixture(dir: string, version: 1 | 2 = 2): Promise<void> {
	await mkdir(join(dir, 'sessions'), { recursive: true });
	await mkdir(join(dir, 'audio'), { recursive: true });
	const s1 = session(
		SESSION_1,
		OLD_EX_A,
		'sessions/2026-09-03/x/a.webm',
		'2026-09-03T20:20:44.701Z'
	);
	const s2 = session(SESSION_2, OLD_EX_B, 'placeholder-audio-key', '2026-09-04T10:00:00.000Z');
	const s3 = session(SESSION_3, null, 'sessions/2026-09-05/x/c.webm', '2026-09-05T10:00:00.000Z');
	for (const s of [s1, s2]) {
		await Bun.write(join(dir, 'sessions', `${s._id}.json`), JSON.stringify(s));
	}
	await Bun.write(join(dir, 'audio', `${SESSION_1}.webm`), new Uint8Array([1, 2, 3]));
	const summary = (s: ReturnType<typeof session>, audioFile: string | null) => {
		const { points: _p, ...pitchData } = s.pitchData;
		return { ...s, pitchData, file: `sessions/${s._id}.json`, audioFile };
	};
	const manifest = {
		format: 'voice-training-export',
		version,
		exportedAt: '2026-09-12T07:44:04.081Z',
		app: '0.1.0',
		settings: {
			_id: 'default',
			targetRange: { low: 180, high: 300 },
			createdAt: '2026-09-03T14:55:22.639Z',
			updatedAt: '2026-09-03T16:37:03.575Z'
		},
		exercises: [exercise(OLD_EX_A, 'Seeded title'), exercise(OLD_EX_B, 'Retired exercise')],
		sessions: [
			summary(s1, `audio/${SESSION_1}.webm`),
			summary(s2, null),
			summary(s3, `audio/${SESSION_3}.webm`),
			{ ...summary(s1, null), _id: 'bad id' }
		],
		rangeTests: [
			{
				_id: RANGE_1,
				lowHz: 90,
				highHz: 400,
				semitones: 25.8,
				notes: '',
				createdAt: '2026-09-01T00:00:00.000Z'
			}
		],
		...(version === 2
			? {
					practiceDays: [
						{
							_id: '2026-09-03',
							steps: [
								{
									exerciseId: OLD_EX_A,
									title: 'Seeded title',
									category: 'warmup',
									purpose: 'p',
									status: 'done',
									seconds: 44,
									sessionIds: [SESSION_2],
									completedAt: '2026-09-03T20:59:18.360Z'
								}
							],
							startedAt: '2026-09-03T20:49:08.104Z',
							updatedAt: '2026-09-03T21:05:52.154Z',
							completedAt: '2026-09-03T21:05:52.154Z'
						}
					]
				}
			: {})
	};
	await Bun.write(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

describe('importDirectory', () => {
	test('imports a v2 export, remapping exercise ids by title', async () => {
		await freshDataDir();
		const {
			upsertExercises,
			listExercises,
			getSessionById,
			getPracticeDay,
			getSettings,
			listAllRangeTests
		} = await db();
		const { openAudio } = await audio();
		const { importDirectory } = await imp();

		// This install seeded the library under its own ids before the import.
		await upsertExercises([{ ...exercise('', 'Seeded title'), _id: undefined } as never]);
		const [seeded] = await listExercises();

		const fixture = join(root, 'fixture-v2');
		await writeFixture(fixture);
		const report = await importDirectory(fixture);

		expect(report).toEqual({
			manifestVersion: 2,
			exportedAt: '2026-09-12T07:44:04.081Z',
			exercises: { matched: 1, added: 1 },
			sessions: {
				added: 2,
				skipped: 0,
				failed: [`${SESSION_3}: session file missing from archive`, `bad id: invalid id`]
			},
			audio: { copied: 1, missing: 1 },
			rangeTests: { added: 1, skipped: 0 },
			practiceDays: { added: 1, skipped: 0 },
			settings: 'imported'
		});

		const s1 = await getSessionById(SESSION_1);
		expect(s1!.exerciseId).toBe(seeded._id);
		expect(s1!.createdAt).toEqual(new Date('2026-09-03T20:20:44.701Z'));
		expect(s1!.pitchData.points).toHaveLength(2);
		const opened = await openAudio(s1!.audioKey);
		expect(opened!.size).toBe(3);

		const s2 = await getSessionById(SESSION_2);
		expect(s2!.exerciseId).toBe(OLD_EX_B);
		expect(s2!.audioKey).toBe('placeholder-audio-key');
		expect((await listExercises()).map((e) => e.title).sort()).toEqual([
			'Retired exercise',
			'Seeded title'
		]);

		const day = await getPracticeDay('2026-09-03');
		expect(day!.steps[0].exerciseId).toBe(seeded._id);
		expect(day!.steps[0].completedAt).toEqual(new Date('2026-09-03T20:59:18.360Z'));
		expect(day!.completedAt).toEqual(new Date('2026-09-03T21:05:52.154Z'));

		const [rangeTest] = await listAllRangeTests();
		expect(rangeTest._id).toBe(RANGE_1);
		expect(rangeTest.mode).toBe('full');

		const settings = await getSettings();
		expect(settings.targetRange).toEqual({ low: 180, high: 300 });
		expect(settings.updatedAt).toEqual(new Date('2026-09-03T16:37:03.575Z'));

		// Second run: everything is already there, local settings win.
		await (await db()).updateSettings({ targetRange: { low: 1, high: 2 } });
		const again = await importDirectory(fixture);
		expect(again.exercises).toEqual({ matched: 2, added: 0 });
		expect(again.sessions).toEqual({
			added: 0,
			skipped: 2,
			failed: [`${SESSION_3}: session file missing from archive`, `bad id: invalid id`]
		});
		expect(again.audio).toEqual({ copied: 0, missing: 0 });
		expect(again.rangeTests).toEqual({ added: 0, skipped: 1 });
		expect(again.practiceDays).toEqual({ added: 0, skipped: 1 });
		expect(again.settings).toBe('kept');
		expect((await getSettings()).targetRange).toEqual({ low: 1, high: 2 });
	});

	test('accepts a v1 export without practice days', async () => {
		await freshDataDir();
		const { importDirectory } = await imp();
		const fixture = join(root, 'fixture-v1');
		await writeFixture(fixture, 1);
		const report = await importDirectory(fixture);
		expect(report.manifestVersion).toBe(1);
		expect(report.sessions.added).toBe(2);
		expect(report.practiceDays).toEqual({ added: 0, skipped: 0 });
	});

	test('replaces an unsafe or placeholder audio key when a recording is present', async () => {
		await freshDataDir();
		const { importDirectory } = await imp();
		const { getSessionById } = await db();
		const { openAudio } = await audio();
		const dir = join(root, 'fixture-key');
		await writeFixture(dir);
		const manifest = await Bun.file(join(dir, 'manifest.json')).json();
		const s = session(SESSION_1, null, '../escape.webm', '2026-09-03T20:20:44.701Z');
		await Bun.write(join(dir, 'sessions', `${SESSION_1}.json`), JSON.stringify(s));
		manifest.sessions = [manifest.sessions[0]];
		await Bun.write(join(dir, 'manifest.json'), JSON.stringify(manifest));

		const report = await importDirectory(dir);
		expect(report.audio.copied).toBe(1);
		const stored = await getSessionById(SESSION_1);
		expect(stored!.audioKey).toMatch(/^sessions\/\d{4}-\d{2}-\d{2}\/6a99d69c6610f1d1a26d08a6\//);
		expect((await openAudio(stored!.audioKey))!.size).toBe(3);
	});

	test('rejects things that are not an export', async () => {
		await freshDataDir();
		const { importDirectory } = await imp();
		const dir = join(root, 'bad');
		await mkdir(dir, { recursive: true });
		await expect(importDirectory(dir)).rejects.toThrow(/manifest.json is missing/);

		await Bun.write(join(dir, 'manifest.json'), '{ nope');
		await expect(importDirectory(dir)).rejects.toThrow(/not valid JSON/);

		const write = (m: object) => Bun.write(join(dir, 'manifest.json'), JSON.stringify(m));
		await write({ format: 'something-else' });
		await expect(importDirectory(dir)).rejects.toThrow(/Not a voice-training-export archive/);
		await write({ format: 'voice-training-export', version: 3 });
		await expect(importDirectory(dir)).rejects.toThrow(/Unsupported export version 3/);
		await write({ format: 'voice-training-export', version: 2, exercises: 'x' });
		await expect(importDirectory(dir)).rejects.toThrow(/manifest.exercises must be an array/);
		await write({
			format: 'voice-training-export',
			version: 2,
			exercises: [],
			sessions: [],
			rangeTests: []
		});
		await expect(importDirectory(dir)).rejects.toThrow(/practiceDays must be an array/);
		await write({
			format: 'voice-training-export',
			version: 1,
			exercises: [],
			sessions: [],
			rangeTests: []
		});
		await expect(importDirectory(dir)).rejects.toThrow(/settings is missing/);
	});

	test('a session file with bad contents is reported, not imported', async () => {
		await freshDataDir();
		const { importDirectory } = await imp();
		const dir = join(root, 'fixture-badsession');
		await writeFixture(dir);
		await Bun.write(join(dir, 'sessions', `${SESSION_1}.json`), JSON.stringify({ _id: SESSION_1 }));
		const s2 = session(SESSION_2, null, 'placeholder-audio-key', 'not a date');
		await Bun.write(join(dir, 'sessions', `${SESSION_2}.json`), JSON.stringify(s2));
		const report = await importDirectory(dir);
		expect(report.sessions.added).toBe(0);
		expect(report.sessions.failed).toContain(`${SESSION_1}: session file has no pitch points`);
		expect(report.sessions.failed).toContain(`${SESSION_2}: invalid date "not a date"`);
	});
});

describe('export → import round trip', () => {
	test('a library exported from one data directory comes back whole in another', async () => {
		const {
			createSession,
			createRangeTest,
			getOrCreatePracticeDay,
			updatePracticeStep,
			updateSettings,
			upsertExercises,
			listExercises,
			iterateSessions,
			listAllRangeTests,
			listAllPracticeDays,
			getSettings
		} = await db();
		const { generateAudioKey, uploadAudio, openAudio } = await audio();
		const { buildExport } = await exp();
		const { importArchive, formatReport } = await imp();

		await freshDataDir();
		await upsertExercises([exercise('', 'Lip trills') as Omit<Exercise, '_id'>]);
		const [ex] = await listExercises();
		const key = generateAudioKey('s', 'audio/mp4');
		await uploadAudio(key, new Uint8Array([9, 8, 7, 6]), 'audio/mp4');
		const { _id: _s, ...sIn } = session('', ex._id, key, '2026-09-10T12:00:00.000Z');
		const saved = await createSession({
			...sIn,
			audioType: 'audio/mp4',
			createdAt: new Date(sIn.createdAt)
		} as Omit<Session, '_id'>);
		const rt = await createRangeTest({
			mode: 'modal',
			lowHz: 100,
			highHz: 300,
			semitones: 19,
			notes: 'n',
			createdAt: new Date(2026, 8, 9)
		});
		const day: PracticeDay = {
			_id: '2026-09-10',
			steps: [
				{
					exerciseId: ex._id,
					title: 'Lip trills',
					category: 'warmup',
					purpose: 'p',
					status: 'pending',
					seconds: 0,
					sessionIds: [],
					completedAt: null
				}
			],
			startedAt: new Date(2026, 8, 10, 9),
			updatedAt: new Date(2026, 8, 10, 9),
			completedAt: null
		};
		await getOrCreatePracticeDay(day);
		const practised = await updatePracticeStep('2026-09-10', 0, {
			sessionId: saved._id,
			addSeconds: 12
		});
		const settings = await updateSettings({ targetRange: { low: 170, high: 240 } });

		// A staging directory left by a crashed export an hour ago is swept first.
		const stale = join(tmpdir(), 'voice-training-export-stale-test');
		await mkdir(stale, { recursive: true });
		const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
		await utimes(stale, old, old);

		const { dir, archivePath, manifest } = await buildExport();
		await expect(stat(stale)).rejects.toThrow();
		expect(manifest.sessions[0].audioFile).toBe(`audio/${saved._id}.m4a`);

		// Into a second, empty install.
		await freshDataDir();
		const report = await importArchive(archivePath);
		await rm(dir, { recursive: true, force: true });
		expect(formatReport(report)).toContain('sessions       1 added, 0 already present');
		expect(report.exercises).toEqual({ matched: 0, added: 1 });
		expect(report.audio).toEqual({ copied: 1, missing: 0 });

		const sessions = [];
		for await (const s of iterateSessions()) sessions.push(s);
		expect(sessions).toEqual([saved]);
		expect((await openAudio(saved.audioKey))!.size).toBe(4);
		expect(await listExercises()).toEqual([ex]);
		expect(await listAllRangeTests()).toEqual([rt]);
		expect(await listAllPracticeDays()).toEqual([practised!]);
		expect(await getSettings()).toEqual(settings);
	});

	test('export refuses to run without tar', async () => {
		const { buildExport } = await exp();
		const which = spyOn(Bun, 'which').mockReturnValue(null);
		try {
			await expect(buildExport()).rejects.toThrow(/needs the `tar` command/);
		} finally {
			which.mockRestore();
		}
	});

	test('importArchive refuses a missing or broken archive', async () => {
		await freshDataDir();
		const { importArchive } = await imp();
		await expect(importArchive(join(root, 'nope.tar.gz'))).rejects.toThrow(/No such file/);
		const broken = join(root, 'broken.tar.gz');
		await Bun.write(broken, 'not a tarball');
		await expect(importArchive(broken)).rejects.toThrow(/tar exited/);
	});
});
