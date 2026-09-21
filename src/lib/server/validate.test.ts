import { describe, expect, test } from 'bun:test';
import {
	LIMITS,
	ValidationError,
	checkAudioSize,
	isValidId,
	parseDate,
	parseDayKey,
	parseDuration,
	parseExerciseId,
	parseExerciseRecord,
	parseMode,
	parsePitchDataField,
	parsePitchPoints,
	parsePracticeDayRecord,
	parseRangeTestBody,
	parseRangeTestRecord,
	parseSessionForm,
	parseSessionRecord,
	parseSettingsBody,
	parseSettingsRange,
	parseSettingsRecord,
	parseStepUpdate,
	parseTargetRange,
	parseTargetRangeField,
	parseTitle,
	readJson
} from './validate';

const ID = '6a99d69c6610f1d1a26d08a6';
const UUID = '01920b6e-4c8a-7d4e-9a1b-3c2d1e0f9a8b';

/** Expect a ValidationError whose message matches. */
function rejects(fn: () => unknown, message: RegExp | string, status = 400) {
	expect(fn).toThrow(ValidationError);
	expect(fn).toThrow(expect.objectContaining({ message: expect.stringMatching(message), status }));
}

const POINTS = [
	{ t: 0, hz: 200, confidence: 0.9 },
	{ t: 0.025, hz: 210, confidence: 0.9 },
	{ t: 0.05, hz: 0, confidence: 0 }
];

function form(fields: Record<string, string>): FormData {
	const f = new FormData();
	for (const [k, v] of Object.entries(fields)) f.set(k, v);
	return f;
}

const GOOD_FORM = {
	title: '  Morning take  ',
	pitchData: JSON.stringify({ points: POINTS, avgPitch: 999 }),
	targetRange: JSON.stringify({ low: 180, high: 300 }),
	duration: '61.9',
	notes: ' keep the whitespace ',
	exerciseId: ID
};

describe('ids and fields', () => {
	test('isValidId takes the two shapes the app has ever produced', () => {
		expect(isValidId(ID)).toBe(true);
		expect(isValidId(UUID)).toBe(true);
		expect(isValidId(ID.toUpperCase())).toBe(true);
		for (const bad of ['', 'abc', ID + '0', 'bad id', 42, null, undefined]) {
			expect(isValidId(bad)).toBe(false);
		}
	});

	test('title is required, trimmed and bounded', () => {
		expect(parseTitle('  hi  ')).toBe('hi');
		expect(parseTitle('x'.repeat(500))).toHaveLength(LIMITS.titleLength);
		rejects(() => parseTitle('   '), 'Title is required');
		rejects(() => parseTitle(undefined), 'Title is required');
	});

	test('duration is whole seconds within a human day', () => {
		expect(parseDuration('61.9')).toBe(61);
		expect(parseDuration(61.9)).toBe(61);
		expect(parseDuration('-5')).toBe(0);
		expect(parseDuration('nope')).toBe(0);
		expect(parseDuration(Infinity)).toBe(0);
		expect(parseDuration(10 ** 9)).toBe(LIMITS.durationSeconds);
	});

	test('exerciseId is optional but well-formed', () => {
		expect(parseExerciseId('')).toBeNull();
		expect(parseExerciseId(null)).toBeNull();
		expect(parseExerciseId(ID)).toBe(ID);
		rejects(() => parseExerciseId('nope'), 'Invalid exerciseId');
	});

	test('dates', () => {
		expect(parseDate('2026-09-03T20:20:44.701Z')).toEqual(new Date('2026-09-03T20:20:44.701Z'));
		expect(parseDate(0)).toEqual(new Date(0));
		rejects(() => parseDate('not a date'), 'invalid date "not a date"');
		rejects(() => parseDate(undefined, 'createdAt'), 'invalid createdAt null');
		rejects(() => parseDate({}, 'createdAt'), 'invalid createdAt');
	});

	test('mode', () => {
		expect(parseMode('modal')).toBe('modal');
		rejects(() => parseMode('head'), 'mode must be one of: full, modal');
		rejects(() => parseMode(undefined), 'mode must be one of');
	});

	test('day key', () => {
		expect(parseDayKey('2026-09-03')).toBe('2026-09-03');
		rejects(() => parseDayKey('2026-9-3'), 'day must look like 2026-09-03');
		rejects(() => parseDayKey(undefined), 'day must look like');
	});

	test('readJson reports a body that is not JSON', async () => {
		const req = (body: string | null) =>
			new Request('http://x/', {
				method: 'POST',
				body,
				headers: { 'content-type': 'application/json' }
			});
		expect(await readJson(req('{"a":1}'))).toEqual({ a: 1 });
		expect(await readJson(req('null'))).toBeNull();
		await expect(readJson(req('{ nope'))).rejects.toThrow('JSON body required');
		await expect(readJson(req(null))).rejects.toThrow(ValidationError);
	});
});

describe('pitch', () => {
	test('target range needs finite ascending bounds', () => {
		expect(parseTargetRange({ low: 180, high: 300 })).toEqual({ low: 180, high: 300 });
		rejects(() => parseTargetRange(null), 'targetRange must be an object');
		rejects(() => parseTargetRange({ low: NaN, high: 300 }), 'finite low and high');
		rejects(() => parseTargetRange({ low: '180', high: 300 }), 'finite low and high');
		rejects(() => parseTargetRange({ low: 300, high: 300 }), 'low must be less than high');
	});

	test('the settings range is clamped into what the app can display', () => {
		expect(parseSettingsRange({ low: 10, high: 900 })).toEqual({ low: 80, high: 400 });
		expect(parseSettingsRange({ low: 180.5, high: 300 })).toEqual({ low: 180.5, high: 300 });
		rejects(() => parseSettingsRange({ low: 10, high: 20 }), 'low must be less than high');
		rejects(() => parseSettingsRange({ low: Infinity, high: 300 }), 'finite low and high');
		expect(parseSettingsBody({ targetRange: { low: 100, high: 200 } })).toEqual({
			targetRange: { low: 100, high: 200 }
		});
		rejects(() => parseSettingsBody(null), 'JSON body must be an object');
		rejects(() => parseSettingsBody('x'), 'JSON body must be an object');
		rejects(() => parseSettingsBody({}), 'targetRange must be an object');
	});

	test('the range form field falls back to the default rather than failing a save', () => {
		expect(parseTargetRangeField('')).toEqual({ low: 180, high: 300 });
		expect(parseTargetRangeField(null)).toEqual({ low: 180, high: 300 });
		expect(parseTargetRangeField('{ nope')).toEqual({ low: 180, high: 300 });
		expect(parseTargetRangeField('{"low":300,"high":200}')).toEqual({ low: 180, high: 300 });
		expect(parseTargetRangeField('{"low":150,"high":250}')).toEqual({ low: 150, high: 250 });
	});

	test('pitch points are finite, complete and capped', () => {
		expect(parsePitchPoints({ points: POINTS })).toEqual(POINTS);
		// Extra fields are dropped, not stored.
		expect(parsePitchPoints({ points: [{ ...POINTS[0], extra: 1 }] })).toEqual([POINTS[0]]);
		rejects(() => parsePitchPoints(null), 'pitchData.points must be an array');
		rejects(() => parsePitchPoints({ points: 'x' }), 'pitchData.points must be an array');
		rejects(
			() => parsePitchPoints({ points: [{ t: 0, hz: 200 }] }),
			'numeric t, hz and confidence'
		);
		rejects(() => parsePitchPoints({ points: [{ t: 0, hz: NaN, confidence: 1 }] }), 'numeric t');
		rejects(() => parsePitchPoints({ points: [null] }), 'numeric t');
		const many = { points: Array.from({ length: LIMITS.pitchPoints + 1 }, () => POINTS[0]) };
		rejects(() => parsePitchPoints(many), 'Too many pitch points (max 200000)');
	});

	test('the pitch form field must be present and be JSON', () => {
		expect(parsePitchDataField(JSON.stringify({ points: POINTS }))).toEqual(POINTS);
		rejects(() => parsePitchDataField(''), 'Pitch data is required');
		rejects(() => parsePitchDataField(null), 'Pitch data is required');
		rejects(() => parsePitchDataField('{ nope'), 'Invalid pitch data format');
		rejects(() => parsePitchDataField('[]'), 'pitchData.points must be an array');
	});
});

describe('sessions', () => {
	test('a take as the studio posts it, summary recomputed from the points', () => {
		expect(parseSessionForm(form(GOOD_FORM))).toEqual({
			exerciseId: ID,
			title: 'Morning take',
			notes: ' keep the whitespace ',
			duration: 61,
			targetRange: { low: 180, high: 300 },
			pitchData: {
				points: POINTS,
				avgPitch: 205,
				medianPitch: 200,
				minPitch: 200,
				maxPitch: 210,
				timeInTargetPct: 100
			}
		});
	});

	test('the summary follows the range the take was recorded against', () => {
		const parsed = parseSessionForm(
			form({ ...GOOD_FORM, targetRange: JSON.stringify({ low: 205, high: 300 }) })
		);
		expect(parsed.pitchData.timeInTargetPct).toBe(50);
	});

	test('minimal form: only title and pitch data', () => {
		const parsed = parseSessionForm(form({ title: 't', pitchData: '{"points":[]}' }));
		expect(parsed).toEqual({
			exerciseId: null,
			title: 't',
			notes: '',
			duration: 0,
			targetRange: { low: 180, high: 300 },
			pitchData: {
				points: [],
				avgPitch: 0,
				medianPitch: 0,
				minPitch: 0,
				maxPitch: 0,
				timeInTargetPct: 0
			}
		});
	});

	test('the form fails on what the route used to fail on', () => {
		const bad = (over: Record<string, string>, m: RegExp | string) =>
			rejects(() => parseSessionForm(form({ ...GOOD_FORM, ...over })), m);
		bad({ title: '' }, 'Title is required');
		bad({ exerciseId: 'x' }, 'Invalid exerciseId');
		bad({ pitchData: '' }, 'Pitch data is required');
		bad({ pitchData: 'nope' }, 'Invalid pitch data format');
		bad({ pitchData: '{"points":[1]}' }, 'numeric t, hz and confidence');
	});

	test('a file part where a text field should be reads as empty', () => {
		const f = form(GOOD_FORM);
		f.set('notes', new File(['x'], 'notes.txt'));
		expect(parseSessionForm(f).notes).toBe('');
	});

	test('audio size is a 413, not a 400', () => {
		expect(() => checkAudioSize(LIMITS.audioBytes)).not.toThrow();
		rejects(() => checkAudioSize(LIMITS.audioBytes + 1), 'Audio file too large', 413);
	});

	test('a session record from an archive is held to the same rules', () => {
		const record = {
			_id: ID,
			exerciseId: null,
			title: 'x'.repeat(300),
			audioKey: 'sessions/2026-09-03/x/a.webm',
			audioType: 'audio/webm',
			duration: 10 ** 9,
			pitchData: {
				points: POINTS,
				avgPitch: 999,
				medianPitch: 999,
				minPitch: 1,
				maxPitch: 2,
				timeInTargetPct: 0
			},
			targetRange: { low: 180, high: 300 },
			notes: 'n'.repeat(6000),
			createdAt: '2026-09-03T20:20:44.701Z'
		};
		const parsed = parseSessionRecord(record);
		expect(parsed.title).toHaveLength(200);
		expect(parsed.notes).toHaveLength(LIMITS.notesLength);
		expect(parsed.duration).toBe(LIMITS.durationSeconds);
		expect(parsed.audioKey).toBe(record.audioKey);
		expect(parsed.audioType).toBe('audio/webm');
		expect(parsed.createdAt).toEqual(new Date(record.createdAt));
		expect(parsed.pitchData).toEqual({
			points: POINTS,
			avgPitch: 205,
			medianPitch: 200,
			minPitch: 200,
			maxPitch: 210,
			timeInTargetPct: 100
		});
		expect(parsed).not.toHaveProperty('_id');

		// The sparse shapes older exports produced.
		const sparse = parseSessionRecord({ pitchData: { points: [] }, createdAt: 0 });
		expect(sparse.title).toBe('Untitled take');
		expect(sparse.targetRange).toEqual({ low: 180, high: 300 });
		expect(sparse.audioKey).toBe('');
		expect(sparse.audioType).toBeUndefined();

		rejects(() => parseSessionRecord('x'), 'session must be an object');
		rejects(() => parseSessionRecord({ _id: ID }), 'session file has no pitch points');
		rejects(
			() => parseSessionRecord({ ...record, createdAt: 'not a date' }),
			'invalid date "not a date"'
		);
		rejects(() => parseSessionRecord({ ...record, exerciseId: 'x' }), 'Invalid exerciseId');
		rejects(
			() => parseSessionRecord({ ...record, targetRange: { low: 1 } }),
			'finite low and high'
		);
	});
});

describe('practice', () => {
	test('step update: index plus at least one change', () => {
		expect(parseStepUpdate({ step: 0, status: 'done' })).toEqual({
			index: 0,
			update: { status: 'done' }
		});
		expect(parseStepUpdate({ step: 2, addSeconds: 61.9, sessionId: ID })).toEqual({
			index: 2,
			update: { addSeconds: 61, sessionId: ID }
		});
		expect(parseStepUpdate({ step: 0, addSeconds: 10 ** 9 }).update.addSeconds).toBe(
			LIMITS.addSeconds
		);

		rejects(() => parseStepUpdate(null), 'JSON body must be an object');
		rejects(() => parseStepUpdate([]), 'JSON body must be an object');
		rejects(() => parseStepUpdate({}), 'step must be a non-negative integer');
		rejects(() => parseStepUpdate({ step: '1' }), 'step must be a non-negative integer');
		rejects(() => parseStepUpdate({ step: 1.5 }), 'step must be a non-negative integer');
		rejects(() => parseStepUpdate({ step: -1 }), 'step must be a non-negative integer');
		rejects(() => parseStepUpdate({ step: 0 }), 'Nothing to update');
		rejects(
			() => parseStepUpdate({ step: 0, status: 'maybe' }),
			'status must be one of: pending, done, skipped'
		);
		rejects(
			() => parseStepUpdate({ step: 0, addSeconds: -1 }),
			'addSeconds must be a non-negative number'
		);
		rejects(
			() => parseStepUpdate({ step: 0, addSeconds: NaN }),
			'addSeconds must be a non-negative number'
		);
		rejects(() => parseStepUpdate({ step: 0, sessionId: 'x' }), 'sessionId must be a session id');
	});

	const STEP = {
		exerciseId: ID,
		title: 'Straw hum',
		category: 'sovt',
		purpose: 'p',
		status: 'done',
		seconds: 44.7,
		sessionIds: [UUID, UUID],
		completedAt: '2026-09-03T20:59:18.360Z'
	};
	const DAY = {
		_id: '2026-09-03',
		steps: [STEP],
		startedAt: '2026-09-03T20:49:08.104Z',
		updatedAt: '2026-09-03T21:05:52.154Z',
		completedAt: null
	};

	test('a practice day record is revived and every step checked', () => {
		const day = parsePracticeDayRecord(DAY);
		expect(day._id).toBe('2026-09-03');
		expect(day.startedAt).toEqual(new Date(DAY.startedAt));
		expect(day.completedAt).toBeNull();
		expect(day.steps).toEqual([
			{
				exerciseId: ID,
				title: 'Straw hum',
				category: 'sovt',
				purpose: 'p',
				status: 'done',
				seconds: 44,
				sessionIds: [UUID],
				completedAt: new Date(STEP.completedAt)
			}
		]);
		expect(
			parsePracticeDayRecord({ ...DAY, steps: [{ ...STEP, seconds: -3, completedAt: undefined }] })
				.steps[0]
		).toMatchObject({ seconds: 0, completedAt: null });

		const bad = (over: Record<string, unknown>, m: RegExp | string) =>
			rejects(() => parsePracticeDayRecord({ ...DAY, steps: [{ ...STEP, ...over }] }), m);
		bad({ status: 'maybe' }, 'status must be one of');
		bad({ category: 'yoga' }, 'category must be one of');
		bad({ exerciseId: '' }, 'step 0 has no exerciseId');
		bad({ sessionIds: ['x'] }, 'step 0 sessionIds must be session ids');
		bad({ sessionIds: 'x' }, 'step 0 sessionIds must be session ids');
		bad({ completedAt: 'soon' }, 'invalid completedAt "soon"');
		rejects(() => parsePracticeDayRecord({ ...DAY, _id: 'yesterday' }), 'day must look like');
		rejects(() => parsePracticeDayRecord({ ...DAY, steps: {} }), 'steps must be an array');
		rejects(() => parsePracticeDayRecord({ ...DAY, steps: [null] }), 'step 0 must be an object');
		rejects(() => parsePracticeDayRecord({ ...DAY, startedAt: null }), 'invalid startedAt null');
		rejects(() => parsePracticeDayRecord(null), 'practice day must be an object');
	});
});

describe('range tests and settings', () => {
	test('range test body: positive ascending Hz, semitones recomputed', () => {
		expect(parseRangeTestBody({ lowHz: 100, highHz: 200, mode: 'modal', notes: 'n' })).toEqual({
			mode: 'modal',
			lowHz: 100,
			highHz: 200,
			semitones: 12,
			notes: 'n'
		});
		expect(
			parseRangeTestBody({ lowHz: 100, highHz: 200, mode: 'full', semitones: 99 }).semitones
		).toBe(12);
		rejects(() => parseRangeTestBody(null), 'JSON body must be an object');
		rejects(
			() => parseRangeTestBody({ lowHz: '100', highHz: 200 }),
			'lowHz and highHz are required numbers'
		);
		rejects(
			() => parseRangeTestBody({ lowHz: 0, highHz: 200, mode: 'full' }),
			'lowHz and highHz must be positive'
		);
		rejects(
			() => parseRangeTestBody({ lowHz: 200, highHz: 100, mode: 'full' }),
			'highHz must be greater than lowHz'
		);
		rejects(() => parseRangeTestBody({ lowHz: 100, highHz: 200 }), 'mode must be one of');
	});

	test('a range test record defaults to the full range and needs a date', () => {
		const parsed = parseRangeTestRecord({
			lowHz: 90,
			highHz: 400,
			notes: '',
			createdAt: '2026-09-01T00:00:00.000Z'
		});
		expect(parsed.mode).toBe('full');
		expect(parsed.createdAt).toEqual(new Date('2026-09-01T00:00:00.000Z'));
		rejects(() => parseRangeTestRecord({ lowHz: 90, highHz: 400 }), 'invalid createdAt');
		rejects(
			() => parseRangeTestRecord({ lowHz: 90, highHz: 400, mode: 'head', createdAt: 0 }),
			'mode must be one of'
		);
	});

	test('a settings record is clamped like a save', () => {
		const parsed = parseSettingsRecord({
			targetRange: { low: 10, high: 300 },
			createdAt: '2026-09-03T14:55:22.639Z',
			updatedAt: '2026-09-03T16:37:03.575Z'
		});
		expect(parsed.targetRange).toEqual({ low: 80, high: 300 });
		expect(parsed.updatedAt).toEqual(new Date('2026-09-03T16:37:03.575Z'));
		rejects(() => parseSettingsRecord({}), 'targetRange must be an object');
		rejects(
			() => parseSettingsRecord({ targetRange: { low: 100, high: 200 } }),
			'invalid createdAt'
		);
	});
});

describe('exercises', () => {
	const EX = {
		_id: ID,
		category: 'warmup' as const,
		title: 'Lip trills',
		description: 'd',
		instructions: 'i',
		estimatedMinutes: 2,
		difficulty: 'beginner' as const
	};

	test('an exercise record keeps what the library needs', () => {
		const { _id: _, ...rest } = EX;
		expect(parseExerciseRecord(EX)).toEqual(rest);
		expect(
			parseExerciseRecord({ ...EX, targetRange: { low: 150, high: 250 } }).targetRange
		).toEqual({
			low: 150,
			high: 250
		});
		expect(parseExerciseRecord({ ...EX, targetRange: null, estimatedMinutes: -1 })).toMatchObject({
			estimatedMinutes: 0
		});
		expect(parseExerciseRecord({ ...EX, estimatedMinutes: 'two' }).estimatedMinutes).toBe(0);
		rejects(() => parseExerciseRecord({ ...EX, title: ' ' }), 'exercise has no title');
		rejects(() => parseExerciseRecord({ ...EX, category: 'yoga' }), 'category must be one of');
		rejects(
			() => parseExerciseRecord({ ...EX, difficulty: 'hard' }),
			'difficulty must be one of: beginner, intermediate, advanced'
		);
		rejects(() => parseExerciseRecord({ ...EX, targetRange: { low: 1 } }), 'finite low and high');
		rejects(() => parseExerciseRecord([]), 'exercise must be an object');
	});
});
