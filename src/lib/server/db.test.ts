import { afterEach, beforeEach, describe, expect, setSystemTime, test } from 'bun:test';
import type { Exercise, PracticeDay, Session } from '$lib/types';

process.env.DATA_DIR = ':memory:';

const {
	closeDatabase,
	createRangeTest,
	createSession,
	deleteRangeTest,
	deleteSession,
	getSessionAudio,
	getDashboardStats,
	getDatabase,
	getExerciseById,
	getOrCreatePracticeDay,
	getPracticeDay,
	getRecentSessions,
	getSessionById,
	getSettings,
	isValidId,
	iterateSessions,
	listAllPracticeDays,
	listAllRangeTests,
	listExercises,
	listPracticeDays,
	listRangeTests,
	listSessions,
	migrateDatabase,
	resetPracticeDaySteps,
	updatePracticeStep,
	updateRangeTestMode,
	updateSettings,
	upsertExercises
} = await import('./db');

beforeEach(() => closeDatabase());

const LEGACY_ID = '66d0a1b2c3d4e5f6a7b8c9d0';
const UUID = '0192b1e0-7f3a-7000-8000-000000000000';

function exercise(title: string, category: Exercise['category'] = 'warmup'): Omit<Exercise, '_id'> {
	return {
		category,
		title,
		description: `${title} description`,
		instructions: `${title} instructions`,
		estimatedMinutes: 3,
		difficulty: 'beginner'
	};
}

function sessionInput(overrides: Partial<Omit<Session, '_id'>> = {}): Omit<Session, '_id'> {
	return {
		exerciseId: null,
		title: 'Take',
		audioKey: 'placeholder-audio-key',
		duration: 60,
		pitchData: {
			points: [
				{ t: 0, hz: 180, confidence: 0.9 },
				{ t: 0.025, hz: 185, confidence: 0.95 }
			],
			avgPitch: 182.5,
			minPitch: 180,
			maxPitch: 185,
			timeInTargetPct: 100
		},
		targetRange: { low: 165, high: 255 },
		notes: '',
		createdAt: new Date(2026, 8, 10, 12, 0),
		...overrides
	};
}

function practiceDay(day: string, at = new Date(2026, 8, 10, 9, 0)): PracticeDay {
	return {
		_id: day,
		steps: [
			{
				exerciseId: UUID,
				title: 'Lip trills',
				category: 'warmup',
				purpose: 'Wake up',
				status: 'pending',
				seconds: 0,
				sessionIds: [],
				completedAt: null
			},
			{
				exerciseId: UUID,
				title: 'Passage',
				category: 'reading',
				purpose: 'Speech',
				status: 'pending',
				seconds: 0,
				sessionIds: [],
				completedAt: null
			}
		],
		startedAt: at,
		updatedAt: at,
		completedAt: null
	};
}

describe('database lifecycle', () => {
	test('migrates once and is idempotent on reopen', async () => {
		await migrateDatabase();
		const db = getDatabase();
		expect(db.query<{ user_version: number }, []>('PRAGMA user_version').get()!.user_version).toBe(
			1
		);
		const tables = db
			.query<{ name: string }, []>(
				`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
			)
			.all()
			.map((r) => r.name);
		expect(tables).toEqual([
			'exercises',
			'practice_days',
			'range_tests',
			'session_points',
			'sessions',
			'settings'
		]);
		expect(getDatabase()).toBe(db);
		closeDatabase();
		closeDatabase();
		expect(getDatabase()).not.toBe(db);
	});

	test('isValidId accepts UUIDs and legacy 24-hex ids only', () => {
		expect(isValidId(UUID)).toBe(true);
		expect(isValidId(LEGACY_ID)).toBe(true);
		expect(isValidId(LEGACY_ID.toUpperCase())).toBe(true);
		expect(isValidId('')).toBe(false);
		expect(isValidId('not-an-id')).toBe(false);
		expect(isValidId(`${UUID}x`)).toBe(false);
	});
});

describe('sessions', () => {
	test('create, read with points, list without them', async () => {
		const created = await createSession(sessionInput({ audioType: 'audio/mp4', notes: 'hi' }));
		expect(isValidId(created._id)).toBe(true);

		const full = await getSessionById(created._id);
		expect(full).toEqual(created);
		expect(full!.createdAt).toBeInstanceOf(Date);

		const { sessions, total } = await listSessions();
		expect(total).toBe(1);
		const { points: _points, ...summary } = created.pitchData;
		expect(sessions[0]).toEqual({ ...created, pitchData: summary });
		expect('points' in sessions[0].pitchData).toBe(false);
	});

	test('unknown and malformed ids read as null and delete as false', async () => {
		expect(await getSessionById(UUID)).toBeNull();
		expect(await getSessionById('nope')).toBeNull();
		expect(await getSessionAudio(UUID)).toBeNull();
		expect(await getSessionAudio('nope')).toBeNull();
		expect(await deleteSession(UUID)).toBe(false);
		expect(await deleteSession('nope')).toBe(false);
	});

	test('paginates newest first and iterates oldest first', async () => {
		for (let i = 0; i < 5; i++) {
			await createSession(sessionInput({ title: `t${i}`, createdAt: new Date(2026, 8, 1 + i) }));
		}
		const page1 = await listSessions(1, 2);
		const page2 = await listSessions(2, 2);
		const page3 = await listSessions(3, 2);
		expect(page1.total).toBe(5);
		expect(page1.sessions.map((s) => s.title)).toEqual(['t4', 't3']);
		expect(page2.sessions.map((s) => s.title)).toEqual(['t2', 't1']);
		expect(page3.sessions.map((s) => s.title)).toEqual(['t0']);
		expect((await getRecentSessions(3)).map((s) => s.title)).toEqual(['t4', 't3', 't2']);

		const titles: string[] = [];
		for await (const s of iterateSessions()) {
			expect(s.pitchData.points).toHaveLength(2);
			titles.push(s.title);
		}
		expect(titles).toEqual(['t0', 't1', 't2', 't3', 't4']);
	});

	test('delete removes the session and its points', async () => {
		const s = await createSession(sessionInput());
		expect(await deleteSession(s._id)).toBe(true);
		expect(await getSessionById(s._id)).toBeNull();
		const orphans = getDatabase()
			.query<{ n: number }, []>('SELECT COUNT(*) AS n FROM session_points')
			.get()!.n;
		expect(orphans).toBe(0);
	});

	test('delete detaches the session from the practice days it was attached to', async () => {
		const gone = await createSession(sessionInput());
		const kept = await createSession(sessionInput());
		await getOrCreatePracticeDay(practiceDay('2026-09-10'));
		await getOrCreatePracticeDay(practiceDay('2026-09-11'));
		await updatePracticeStep('2026-09-10', 0, { sessionId: kept._id, addSeconds: 20 });
		await updatePracticeStep('2026-09-10', 0, { sessionId: gone._id });
		await updatePracticeStep('2026-09-10', 1, { sessionId: gone._id });
		const untouched = await getPracticeDay('2026-09-11');

		expect(await deleteSession(gone._id)).toBe(true);

		const day = await getPracticeDay('2026-09-10');
		expect(day!.steps.map((s) => s.sessionIds)).toEqual([[kept._id], []]);
		expect(day!.steps.map((s) => s.status)).toEqual(['done', 'done']);
		expect(day!.steps[0].seconds).toBe(20);
		expect(await getPracticeDay('2026-09-11')).toEqual(untouched);
	});

	test('a session without stored points still reads', async () => {
		const s = await createSession(sessionInput());
		getDatabase().run('DELETE FROM session_points');
		expect((await getSessionById(s._id))!.pitchData.points).toEqual([]);
	});
});

describe('exercises', () => {
	test('upsert by title keeps ids stable and reports added vs updated', async () => {
		const first = await upsertExercises([exercise('A'), exercise('B', 'reading')]);
		expect(first).toEqual({ added: 2, updated: 0 });
		const [a] = await listExercises('warmup');
		expect(a.title).toBe('A');

		const second = await upsertExercises([
			{ ...exercise('A'), description: 'changed', targetRange: { low: 1, high: 2 } },
			exercise('C', 'pitch')
		]);
		expect(second).toEqual({ added: 1, updated: 1 });
		const again = await getExerciseById(a._id);
		expect(again!.description).toBe('changed');
		expect(again!.targetRange).toEqual({ low: 1, high: 2 });
		expect((await listExercises()).map((e) => e.title)).toEqual(['A', 'C', 'B']); // CATEGORY_ORDER
	});

	test('filters by category and difficulty', async () => {
		await upsertExercises([
			exercise('A'),
			{ ...exercise('B'), difficulty: 'advanced' },
			exercise('C', 'pitch')
		]);
		expect((await listExercises(undefined, 'advanced')).map((e) => e.title)).toEqual(['B']);
		expect((await listExercises('warmup', 'beginner')).map((e) => e.title)).toEqual(['A']);
		expect((await listExercises('warmup')).map((e) => e.title)).toEqual(['A', 'B']);
		expect(await getExerciseById(UUID)).toBeNull();
		expect(await getExerciseById('nope')).toBeNull();
	});
});

describe('settings', () => {
	test('defaults until saved, then a single upserted row', async () => {
		const defaults = await getSettings();
		expect(defaults._id).toBe('default');
		expect(defaults.targetRange.low).toBeLessThan(defaults.targetRange.high);

		const saved = await updateSettings({ targetRange: { low: 170, high: 240 } });
		expect(saved.targetRange).toEqual({ low: 170, high: 240 });
		const again = await updateSettings({ targetRange: { low: 175, high: 245 } });
		expect(again.createdAt).toEqual(saved.createdAt);
		expect(again.updatedAt.getTime()).toBeGreaterThanOrEqual(saved.updatedAt.getTime());
		expect((await getSettings()).targetRange).toEqual({ low: 175, high: 245 });
		expect(
			getDatabase().query<{ n: number }, []>('SELECT COUNT(*) AS n FROM settings').get()!.n
		).toBe(1);
	});
});

describe('range tests', () => {
	test('create, list both ways, relabel, delete', async () => {
		const a = await createRangeTest({
			mode: 'full',
			lowHz: 90,
			highHz: 400,
			semitones: 25.8,
			notes: '',
			createdAt: new Date(2026, 8, 1)
		});
		const b = await createRangeTest({
			mode: 'modal',
			lowHz: 100,
			highHz: 300,
			semitones: 19,
			notes: 'n',
			createdAt: new Date(2026, 8, 2)
		});
		expect((await listAllRangeTests()).map((t) => t._id)).toEqual([a._id, b._id]);
		expect((await listRangeTests(1)).map((t) => t._id)).toEqual([b._id]);
		expect(await listRangeTests()).toEqual([b, a]);

		expect((await updateRangeTestMode(a._id, 'modal'))!.mode).toBe('modal');
		expect(await updateRangeTestMode(UUID, 'modal')).toBeNull();
		expect(await updateRangeTestMode('nope', 'modal')).toBeNull();

		expect(await deleteRangeTest(a._id)).toBe(true);
		expect(await deleteRangeTest(a._id)).toBe(false);
		expect(await deleteRangeTest('nope')).toBe(false);
		expect(await listAllRangeTests()).toEqual([b]);
	});
});

describe('practice days', () => {
	test('get-or-create is idempotent and keeps the first row', async () => {
		expect(await getPracticeDay('2026-09-10')).toBeNull();
		const fresh = practiceDay('2026-09-10');
		const created = await getOrCreatePracticeDay(fresh);
		expect(created).toEqual(fresh);
		const later = await getOrCreatePracticeDay(
			practiceDay('2026-09-10', new Date(2026, 8, 10, 10))
		);
		expect(later.startedAt).toEqual(fresh.startedAt);
		expect(await getPracticeDay('2026-09-10')).toEqual(fresh);
	});

	test('step updates and reset go through the pure logic, dates survive the round trip', async () => {
		await getOrCreatePracticeDay(practiceDay('2026-09-10'));
		const done = await updatePracticeStep('2026-09-10', 0, { status: 'done', addSeconds: 90 });
		expect(done!.steps[0].status).toBe('done');
		expect(done!.steps[0].seconds).toBe(90);
		expect(done!.steps[0].completedAt).toBeInstanceOf(Date);
		expect(done!.completedAt).toBeNull();

		const attached = await updatePracticeStep('2026-09-10', 1, { sessionId: UUID, addSeconds: 30 });
		expect(attached!.steps[1].sessionIds).toEqual([UUID]);
		expect(attached!.completedAt).toBeInstanceOf(Date);

		const read = await getPracticeDay('2026-09-10');
		expect(read).toEqual(attached);

		const reset = await resetPracticeDaySteps('2026-09-10');
		expect(reset!.steps.every((s) => s.status === 'pending' && s.completedAt === null)).toBe(true);
		expect(reset!.steps[0].seconds).toBe(90);
		expect(reset!.completedAt).toBeNull();

		expect(await updatePracticeStep('2026-09-11', 0, { status: 'done' })).toBeNull();
		expect(await resetPracticeDaySteps('2026-09-11')).toBeNull();
		await expect(updatePracticeStep('2026-09-10', 7, { status: 'done' })).rejects.toThrow(
			RangeError
		);
		// A failed transform writes nothing.
		expect(await getPracticeDay('2026-09-10')).toEqual(reset);
	});

	test('lists newest first summarised, and everything oldest first in full', async () => {
		await getOrCreatePracticeDay(practiceDay('2026-09-08'));
		await getOrCreatePracticeDay(practiceDay('2026-09-10'));
		await getOrCreatePracticeDay(practiceDay('2026-09-09'));
		await updatePracticeStep('2026-09-09', 0, { status: 'done', addSeconds: 10 });

		const recent = await listPracticeDays(2);
		expect(recent.map((d) => d.day)).toEqual(['2026-09-10', '2026-09-09']);
		expect(recent[1]).toEqual({
			day: '2026-09-09',
			doneSteps: 1,
			totalSteps: 2,
			seconds: 10,
			complete: false
		});
		expect((await listAllPracticeDays()).map((d) => d._id)).toEqual([
			'2026-09-08',
			'2026-09-09',
			'2026-09-10'
		]);
	});
});

describe('dashboard stats', () => {
	// The fixtures and getDashboardStats both read the clock; pin it so a run
	// that straddles midnight cannot put "today" on two different days.
	beforeEach(() => setSystemTime(new Date(2026, 8, 15, 23, 59, 59)));
	afterEach(() => setSystemTime());

	test('is empty on a fresh database', async () => {
		const stats = await getDashboardStats();
		expect(stats).toEqual({
			recentSessions: [],
			totalSessions: 0,
			totalPracticeTime: 0,
			practiceStreak: 0,
			pitchTrend: [],
			categoryBreakdown: [],
			todayPractice: null
		});
	});

	test('aggregates sessions, joins categories, counts practised days into the streak', async () => {
		await upsertExercises([exercise('A', 'warmup'), exercise('B', 'reading')]);
		const [a, b] = await listExercises();
		const now = new Date();
		const daysAgo = (n: number, hour = 12) =>
			new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, hour);

		await createSession(sessionInput({ exerciseId: a._id, duration: 100, createdAt: daysAgo(0) }));
		await createSession(sessionInput({ exerciseId: a._id, duration: 50, createdAt: daysAgo(1) }));
		await createSession(
			sessionInput({ exerciseId: b._id, duration: 25, createdAt: daysAgo(1, 8) })
		);
		await createSession(
			sessionInput({ exerciseId: LEGACY_ID, duration: 1, createdAt: daysAgo(3) })
		);
		// Day 2 has no recording, only a routine with a done step.
		const twoAgo = daysAgo(2);
		const key = `${twoAgo.getFullYear()}-${String(twoAgo.getMonth() + 1).padStart(2, '0')}-${String(twoAgo.getDate()).padStart(2, '0')}`;
		await getOrCreatePracticeDay(practiceDay(key, twoAgo));
		await updatePracticeStep(key, 0, { status: 'done', addSeconds: 30 });
		const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
		await getOrCreatePracticeDay(practiceDay(todayKey, now));

		const stats = await getDashboardStats();
		expect(stats.totalSessions).toBe(4);
		// 176 s of takes plus the 30 s spent on the routine step without one.
		expect(stats.totalPracticeTime).toBe(206);
		expect(stats.recentSessions).toHaveLength(4);
		expect(stats.practiceStreak).toBe(4);
		expect(stats.pitchTrend).toHaveLength(4);
		expect(stats.pitchTrend[0].date.getTime()).toBeLessThan(stats.pitchTrend[3].date.getTime());
		expect(stats.categoryBreakdown).toEqual([
			{ category: 'reading', count: 1 },
			{ category: 'warmup', count: 2 }
		]);
		expect(stats.todayPractice).toEqual({
			day: todayKey,
			doneSteps: 0,
			totalSteps: 2,
			seconds: 0,
			complete: false
		});
	});
});
