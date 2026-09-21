import { DEFAULT_TARGET_RANGE, semitonesBetween } from '$lib/audio/utils';
import { summarisePitch } from '$lib/audio/stats';
import { CATEGORY_ORDER } from '$lib/categories';
import { DAY_KEY } from '$lib/days';
import type {
	Difficulty,
	Exercise,
	ExerciseCategory,
	PitchPoint,
	PitchRange,
	PracticeDay,
	PracticeStep,
	PracticeStepStatus,
	RangeTest,
	RangeTestMode,
	Session,
	UserSettings
} from '$lib/types';
import { STEP_STATUSES, type StepUpdate } from './practice';

/**
 * Every rule about what the app accepts from outside, in one pure module.
 *
 * Two doors lead in: the JSON and multipart bodies the pages send to the API
 * routes, and the records inside an export archive somebody imports. Both are
 * untrusted, and both used to be checked in different places to different
 * standards (the importer skipped every cap the routes enforced). Now the
 * routes and the importer call the same functions, and those functions are
 * plain input → typed value, so they are tested table-style with no server.
 *
 * Anything wrong throws a ValidationError with the message the caller should
 * show. Routes map it to an HTTP status (see http.ts); the importer puts it in
 * the report.
 */

export class ValidationError extends Error {
	readonly status: 400 | 413;
	constructor(message: string, status: 400 | 413 = 400) {
		super(message);
		this.name = 'ValidationError';
		this.status = status;
	}
}

// Generous ceilings. A 30-minute recording is ~15 MB of Opus and ~100k pitch
// points; anything past these is a bug or abuse, not practice.
export const LIMITS = {
	audioBytes: 50 * 1024 * 1024,
	pitchPoints: 200_000,
	titleLength: 200,
	notesLength: 5000,
	durationSeconds: 4 * 60 * 60,
	/** Nobody spends longer than this on one step in one go; past it is a timer left running overnight. */
	addSeconds: 4 * 60 * 60,
	/** The target range Settings will store, in Hz. */
	targetRange: { low: 80, high: 400 }
} as const;

/**
 * Ids are UUIDv7 (time-ordered, so they sort like createdAt). The 24-hex form
 * is what the Mongo years produced; imported data keeps those ids so its
 * sessions still point at their exercises.
 */
const ID_PATTERN =
	/^(?:[0-9a-f]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function isValidId(id: unknown): id is string {
	return typeof id === 'string' && ID_PATTERN.test(id);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function fail(message: string): never {
	throw new ValidationError(message);
}

/** The body of a request as JSON, or a ValidationError when there is none. */
export async function readJson(request: Request): Promise<unknown> {
	try {
		return await request.json();
	} catch {
		return fail('JSON body required');
	}
}

/** A record, or a ValidationError naming what should have been one. */
export function asRecord(value: unknown, what = 'JSON body'): Record<string, unknown> {
	if (!isRecord(value)) fail(`${what} must be an object`);
	return value;
}

// ---------------------------------------------------------------------------
// Fields

/** A string field, trimmed and cut to `max`. Missing reads as ''. */
export function parseText(value: unknown, max: number): string {
	return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Notes keep their whitespace; only the length is bounded. */
export function parseNotes(value: unknown): string {
	return typeof value === 'string' ? value.slice(0, LIMITS.notesLength) : '';
}

/** A title: required, trimmed, bounded. */
export function parseTitle(value: unknown): string {
	const title = parseText(value, LIMITS.titleLength);
	if (!title) fail('Title is required');
	return title;
}

/** A session's length in whole seconds, clamped to something a human did. */
export function parseDuration(value: unknown): number {
	const n = typeof value === 'string' ? Number(value) : value;
	if (!isFiniteNumber(n)) return 0;
	return Math.min(LIMITS.durationSeconds, Math.max(0, Math.floor(n)));
}

/** A reference to an exercise: absent, or a well-formed id. */
export function parseExerciseId(value: unknown): string | null {
	if (value === undefined || value === null || value === '') return null;
	if (!isValidId(value)) fail('Invalid exerciseId');
	return value;
}

/** An ISO date (or anything Date can read), as a Date. */
export function parseDate(value: unknown, field = 'date'): Date {
	if (typeof value !== 'string' && typeof value !== 'number') {
		fail(`invalid ${field} ${JSON.stringify(value ?? null)}`);
	}
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) fail(`invalid ${field} ${JSON.stringify(value)}`);
	return d;
}

const MODES: RangeTestMode[] = ['full', 'modal'];

export function parseMode(value: unknown): RangeTestMode {
	if (typeof value !== 'string' || !MODES.includes(value as RangeTestMode)) {
		fail(`mode must be one of: ${MODES.join(', ')}`);
	}
	return value as RangeTestMode;
}

// ---------------------------------------------------------------------------
// Pitch

/**
 * A pitch range as `{ low, high }` with finite Hz and low below high. This is
 * the shape a session carries; Settings adds the stored bounds on top.
 */
export function parseTargetRange(value: unknown): PitchRange {
	const r = asRecord(value, 'targetRange');
	if (!isFiniteNumber(r.low) || !isFiniteNumber(r.high)) {
		fail('Invalid targetRange: must have finite low and high values');
	}
	if (r.low >= r.high) fail('Invalid range: low must be less than high');
	return { low: r.low, high: r.high };
}

/**
 * The range Settings will save: clamped into what the app can display, and
 * still ascending afterwards. typeof NaN === 'number' and NaN sails through a
 * clamp, which is why finiteness is checked first.
 */
export function parseSettingsRange(value: unknown): PitchRange {
	const r = asRecord(value, 'targetRange');
	if (!isFiniteNumber(r.low) || !isFiniteNumber(r.high)) {
		fail('Invalid targetRange: must have finite low and high values');
	}
	const { low: min, high: max } = LIMITS.targetRange;
	const clamp = (n: number) => Math.max(min, Math.min(max, n));
	const range = { low: clamp(r.low), high: clamp(r.high) };
	if (range.low >= range.high) fail('Invalid range: low must be less than high');
	return range;
}

/**
 * The target range a take was recorded against, as the studio sends it: a
 * JSON string in a form field. Absent or unreadable falls back to the default
 * rather than failing the save, since the range only affects the summary.
 */
export function parseTargetRangeField(raw: unknown): PitchRange {
	if (typeof raw !== 'string' || !raw) return DEFAULT_TARGET_RANGE;
	try {
		return parseTargetRange(JSON.parse(raw));
	} catch {
		return DEFAULT_TARGET_RANGE;
	}
}

/** The per-frame pitch track: a bounded array of finite `{ t, hz, confidence }`. */
export function parsePitchPoints(value: unknown): PitchPoint[] {
	const candidate = isRecord(value) ? value.points : undefined;
	if (!Array.isArray(candidate)) fail('pitchData.points must be an array');
	if (candidate.length > LIMITS.pitchPoints) {
		fail(`Too many pitch points (max ${LIMITS.pitchPoints})`);
	}
	const points: PitchPoint[] = [];
	for (const p of candidate as unknown[]) {
		if (
			!isRecord(p) ||
			!isFiniteNumber(p.t) ||
			!isFiniteNumber(p.hz) ||
			!isFiniteNumber(p.confidence)
		) {
			fail('Each pitch point needs numeric t, hz and confidence');
		}
		points.push({ t: p.t, hz: p.hz, confidence: p.confidence });
	}
	return points;
}

/** The pitch track as a JSON string in a form field. */
export function parsePitchDataField(raw: unknown): PitchPoint[] {
	if (typeof raw !== 'string' || !raw) fail('Pitch data is required');
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return fail('Invalid pitch data format');
	}
	return parsePitchPoints(parsed);
}

// ---------------------------------------------------------------------------
// Sessions

/** What a validated new take looks like before it gets an id and an audio key. */
export type NewSession = Omit<Session, '_id' | 'audioKey' | 'audioType' | 'createdAt'>;

/**
 * A take as the studio posts it: multipart fields, pitch data and range as
 * JSON strings. The summary numbers are always recomputed from the points
 * against the range, never taken from the client.
 */
export function parseSessionForm(form: FormData): NewSession {
	const title = parseTitle(form.get('title'));
	const notes = parseNotes(form.get('notes'));
	const exerciseId = parseExerciseId(form.get('exerciseId'));
	const targetRange = parseTargetRangeField(form.get('targetRange'));
	const points = parsePitchDataField(form.get('pitchData'));
	const duration = parseDuration(form.get('duration'));
	return {
		exerciseId,
		title,
		notes,
		duration,
		targetRange,
		pitchData: { points, ...summarisePitch(points, targetRange) }
	};
}

/** An uploaded recording's size against the ceiling; 413, not 400. */
export function checkAudioSize(bytes: number): void {
	if (bytes > LIMITS.audioBytes) throw new ValidationError('Audio file too large', 413);
}

/**
 * A session record out of an export archive. Same rules as an upload, plus the
 * stored fields: the audio key and type are passed through for the importer to
 * vet against the files it actually finds, and the summary is recomputed so an
 * archive cannot claim numbers its points do not support.
 */
export function parseSessionRecord(value: unknown): Omit<Session, '_id'> {
	const r = asRecord(value, 'session');
	if (!isRecord(r.pitchData) || !Array.isArray(r.pitchData.points)) {
		fail('session file has no pitch points');
	}
	const points = parsePitchPoints(r.pitchData);
	const targetRange = isRecord(r.targetRange)
		? parseTargetRange(r.targetRange)
		: DEFAULT_TARGET_RANGE;
	return {
		exerciseId: parseExerciseId(r.exerciseId),
		title: parseText(r.title, LIMITS.titleLength) || 'Untitled take',
		audioKey: typeof r.audioKey === 'string' ? r.audioKey : '',
		audioType: typeof r.audioType === 'string' ? r.audioType : undefined,
		duration: parseDuration(r.duration),
		pitchData: { points, ...summarisePitch(points, targetRange) },
		targetRange,
		notes: parseNotes(r.notes),
		createdAt: parseDate(r.createdAt, 'date')
	};
}

// ---------------------------------------------------------------------------
// Practice days

/** The day key in a URL: `2026-09-03`. */
export function parseDayKey(value: unknown): string {
	if (typeof value !== 'string' || !DAY_KEY.test(value)) fail('day must look like 2026-09-03');
	return value;
}

/** The body of a practice PATCH: `{ step, status?, addSeconds?, sessionId? }`. */
export function parseStepUpdate(body: unknown): { index: number; update: StepUpdate } {
	const b = asRecord(body);

	const index = b.step;
	if (!Number.isInteger(index) || (index as number) < 0) {
		fail('step must be a non-negative integer');
	}

	const update: StepUpdate = {};
	if (b.status !== undefined) update.status = parseStepStatus(b.status);
	if (b.addSeconds !== undefined) {
		if (!isFiniteNumber(b.addSeconds) || b.addSeconds < 0) {
			fail('addSeconds must be a non-negative number');
		}
		update.addSeconds = Math.min(LIMITS.addSeconds, Math.floor(b.addSeconds));
	}
	if (b.sessionId !== undefined) {
		if (!isValidId(b.sessionId)) fail('sessionId must be a session id');
		update.sessionId = b.sessionId;
	}
	if (Object.keys(update).length === 0) {
		fail('Nothing to update: give status, addSeconds or sessionId');
	}
	return { index: index as number, update };
}

function parseStepStatus(value: unknown): PracticeStepStatus {
	if (typeof value !== 'string' || !STEP_STATUSES.includes(value as PracticeStepStatus)) {
		fail(`status must be one of: ${STEP_STATUSES.join(', ')}`);
	}
	return value as PracticeStepStatus;
}

function parseCategory(value: unknown): ExerciseCategory {
	if (typeof value !== 'string' || !CATEGORY_ORDER.includes(value as ExerciseCategory)) {
		fail(`category must be one of: ${CATEGORY_ORDER.join(', ')}`);
	}
	return value as ExerciseCategory;
}

function parseStepRecord(value: unknown, index: number): PracticeStep {
	const s = asRecord(value, `step ${index}`);
	if (typeof s.exerciseId !== 'string' || !s.exerciseId) fail(`step ${index} has no exerciseId`);
	if (!Array.isArray(s.sessionIds) || !s.sessionIds.every(isValidId)) {
		fail(`step ${index} sessionIds must be session ids`);
	}
	const seconds = isFiniteNumber(s.seconds) && s.seconds > 0 ? Math.floor(s.seconds) : 0;
	return {
		exerciseId: s.exerciseId,
		title: parseText(s.title, LIMITS.titleLength),
		category: parseCategory(s.category),
		purpose: parseText(s.purpose, LIMITS.notesLength),
		status: parseStepStatus(s.status),
		seconds,
		sessionIds: [...new Set(s.sessionIds as string[])],
		completedAt: s.completedAt == null ? null : parseDate(s.completedAt, 'completedAt')
	};
}

/** A practice day out of an export archive, dates revived and every step checked. */
export function parsePracticeDayRecord(value: unknown): PracticeDay {
	const r = asRecord(value, 'practice day');
	const _id = parseDayKey(r._id);
	if (!Array.isArray(r.steps)) fail(`practice day ${_id} steps must be an array`);
	return {
		_id,
		steps: r.steps.map(parseStepRecord),
		startedAt: parseDate(r.startedAt, 'startedAt'),
		updatedAt: parseDate(r.updatedAt, 'updatedAt'),
		completedAt: r.completedAt == null ? null : parseDate(r.completedAt, 'completedAt')
	};
}

// ---------------------------------------------------------------------------
// Range tests and settings

/** The body of a range-test POST. Semitones are always recomputed from the bounds. */
export function parseRangeTestBody(body: unknown): Omit<RangeTest, '_id' | 'createdAt'> {
	const b = asRecord(body);
	if (!isFiniteNumber(b.lowHz) || !isFiniteNumber(b.highHz)) {
		fail('lowHz and highHz are required numbers');
	}
	if (b.lowHz <= 0 || b.highHz <= 0) fail('lowHz and highHz must be positive');
	if (b.highHz <= b.lowHz) fail('highHz must be greater than lowHz');
	return {
		mode: parseMode(b.mode),
		lowHz: b.lowHz,
		highHz: b.highHz,
		semitones: semitonesBetween(b.lowHz, b.highHz),
		notes: parseNotes(b.notes)
	};
}

/** A range test out of an export archive. Tests predating the mode toggle measured the full range. */
export function parseRangeTestRecord(value: unknown): Omit<RangeTest, '_id'> {
	const r = asRecord(value, 'range test');
	return {
		...parseRangeTestBody({ ...r, mode: r.mode ?? 'full' }),
		createdAt: parseDate(r.createdAt, 'createdAt')
	};
}

/** The body of a settings PUT: `{ targetRange }`. */
export function parseSettingsBody(body: unknown): { targetRange: PitchRange } {
	return { targetRange: parseSettingsRange(asRecord(body).targetRange) };
}

/** The settings out of an export archive, held to the same bounds as a save. */
export function parseSettingsRecord(value: unknown): Omit<UserSettings, '_id'> {
	const r = asRecord(value, 'settings');
	return {
		targetRange: parseSettingsRange(r.targetRange),
		createdAt: parseDate(r.createdAt, 'createdAt'),
		updatedAt: parseDate(r.updatedAt, 'updatedAt')
	};
}

// ---------------------------------------------------------------------------
// Exercises

const DIFFICULTIES: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

/** An exercise out of an export archive. The id is the caller's to decide. */
export function parseExerciseRecord(value: unknown): Omit<Exercise, '_id'> {
	const r = asRecord(value, 'exercise');
	const title = parseText(r.title, LIMITS.titleLength);
	if (!title) fail('exercise has no title');
	if (typeof r.difficulty !== 'string' || !DIFFICULTIES.includes(r.difficulty as Difficulty)) {
		fail(`difficulty must be one of: ${DIFFICULTIES.join(', ')}`);
	}
	const exercise: Omit<Exercise, '_id'> = {
		category: parseCategory(r.category),
		title,
		description: parseText(r.description, LIMITS.notesLength),
		instructions: parseText(r.instructions, LIMITS.notesLength),
		estimatedMinutes: isFiniteNumber(r.estimatedMinutes) ? Math.max(0, r.estimatedMinutes) : 0,
		difficulty: r.difficulty as Difficulty
	};
	if (r.targetRange != null) exercise.targetRange = parseTargetRange(r.targetRange);
	return exercise;
}
