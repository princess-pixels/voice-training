import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
	Session,
	Exercise,
	ExerciseCategory,
	Difficulty,
	RangeTest,
	RangeTestMode,
	UserSettings,
	PitchData,
	PitchRange,
	SessionSummary,
	PitchSummary,
	PracticeDay,
	PracticeDaySummary,
	PracticeStep
} from '$lib/types';
import { CATEGORY_ORDER } from '$lib/categories';
import {
	applyStepUpdate,
	localDayKey,
	resetPracticeDay,
	summarisePracticeDay,
	type StepUpdate
} from './practice';
import { DEFAULT_TARGET_RANGE } from '$lib/audio/utils';
import { dataDir, isInMemory } from './config';

/**
 * Storage on bun:sqlite, one file under the data directory. Every function
 * here keeps the name and shape it had on Mongo, so the routes did not change.
 * They stay async for the same reason, although SQLite answers synchronously.
 */

export const DATABASE_FILE = 'voice-training.db';

/**
 * Ids are UUIDv7 (time-ordered, so they sort like createdAt). The 24-hex form
 * is what the Mongo years produced; imported data keeps those ids so its
 * sessions still point at their exercises.
 */
const ID_PATTERN =
	/^(?:[0-9a-f]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function isValidId(id: string): boolean {
	return ID_PATTERN.test(id);
}

function newId(): string {
	return Bun.randomUUIDv7();
}

let db: Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
	id TEXT PRIMARY KEY,
	exercise_id TEXT,
	title TEXT NOT NULL,
	audio_key TEXT NOT NULL,
	audio_type TEXT,
	duration INTEGER NOT NULL,
	avg_pitch REAL NOT NULL,
	min_pitch REAL NOT NULL,
	max_pitch REAL NOT NULL,
	time_in_target_pct REAL NOT NULL,
	target_low REAL NOT NULL,
	target_high REAL NOT NULL,
	notes TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_created_at ON sessions (created_at);
CREATE INDEX IF NOT EXISTS sessions_exercise_id ON sessions (exercise_id);

-- One JSON blob per session, in its own table so lists never read the points.
CREATE TABLE IF NOT EXISTS session_points (
	session_id TEXT PRIMARY KEY REFERENCES sessions (id) ON DELETE CASCADE,
	points TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercises (
	id TEXT PRIMARY KEY,
	category TEXT NOT NULL,
	title TEXT NOT NULL UNIQUE,
	description TEXT NOT NULL,
	instructions TEXT NOT NULL,
	target_low REAL,
	target_high REAL,
	estimated_minutes INTEGER NOT NULL,
	difficulty TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS exercises_category_difficulty ON exercises (category, difficulty);

CREATE TABLE IF NOT EXISTS range_tests (
	id TEXT PRIMARY KEY,
	mode TEXT NOT NULL,
	low_hz REAL NOT NULL,
	high_hz REAL NOT NULL,
	semitones REAL NOT NULL,
	notes TEXT NOT NULL DEFAULT '',
	created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS range_tests_created_at ON range_tests (created_at);

-- Keyed by local day; the steps are a JSON array (see PracticeStep).
CREATE TABLE IF NOT EXISTS practice_days (
	day TEXT PRIMARY KEY,
	steps TEXT NOT NULL,
	started_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS settings (
	id TEXT PRIMARY KEY,
	target_low REAL NOT NULL,
	target_high REAL NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
`;

const SCHEMA_VERSION = 1;

function databasePath(): string {
	if (isInMemory()) return ':memory:';
	mkdirSync(dataDir(), { recursive: true });
	return join(dataDir(), DATABASE_FILE);
}

function open(): Database {
	const database = new Database(databasePath(), { create: true, strict: true });
	database.run('PRAGMA journal_mode = WAL');
	database.run('PRAGMA foreign_keys = ON');
	// A second process (an import, a stuck export) may hold the write lock briefly.
	database.run('PRAGMA busy_timeout = 5000');
	applySchema(database);
	return database;
}

function applySchema(database: Database): void {
	const { user_version } = database
		.query<{ user_version: number }, []>('PRAGMA user_version')
		.get()!;
	if (user_version >= SCHEMA_VERSION) return;
	database.transaction(() => {
		database.run(SCHEMA);
		database.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
	})();
	if (user_version === 0 && !isInMemory()) console.log(`[db] Created ${databasePath()}`);
}

/** The open connection, opened (and migrated) on first use. */
export function getDatabase(): Database {
	return (db ??= open());
}

type Params = Record<string, string | number | null>;

/** Run a statement with named parameters. `Database.run` is typed for positional ones only. */
function exec(database: Database, sql: string, params: Params) {
	return database.query<unknown, Params>(sql).run(params);
}

/** Open and migrate now, so a broken data directory fails at boot, not on the first request. */
export async function migrateDatabase(): Promise<void> {
	getDatabase();
}

/** Close the connection. The next call reopens it; in memory, that is a fresh database. */
export function closeDatabase(): void {
	db?.close();
	db = null;
}

// Rows and converters

interface SessionRow {
	id: string;
	exercise_id: string | null;
	title: string;
	audio_key: string;
	audio_type: string | null;
	duration: number;
	avg_pitch: number;
	min_pitch: number;
	max_pitch: number;
	time_in_target_pct: number;
	target_low: number;
	target_high: number;
	notes: string;
	created_at: number;
}

const SESSION_COLUMNS =
	'id, exercise_id, title, audio_key, audio_type, duration, avg_pitch, min_pitch, max_pitch, time_in_target_pct, target_low, target_high, notes, created_at';

function toSessionSummary(row: SessionRow): SessionSummary {
	return {
		_id: row.id,
		exerciseId: row.exercise_id,
		title: row.title,
		audioKey: row.audio_key,
		audioType: row.audio_type ?? undefined,
		duration: row.duration,
		pitchData: {
			avgPitch: row.avg_pitch,
			minPitch: row.min_pitch,
			maxPitch: row.max_pitch,
			timeInTargetPct: row.time_in_target_pct
		},
		targetRange: { low: row.target_low, high: row.target_high },
		notes: row.notes,
		createdAt: new Date(row.created_at)
	};
}

function toSession(row: SessionRow, points: string | null): Session {
	const summary = toSessionSummary(row);
	return {
		...summary,
		pitchData: { points: points ? JSON.parse(points) : [], ...summary.pitchData }
	};
}

interface ExerciseRow {
	id: string;
	category: ExerciseCategory;
	title: string;
	description: string;
	instructions: string;
	target_low: number | null;
	target_high: number | null;
	estimated_minutes: number;
	difficulty: Difficulty;
}

function toExercise(row: ExerciseRow): Exercise {
	return {
		_id: row.id,
		category: row.category,
		title: row.title,
		description: row.description,
		instructions: row.instructions,
		targetRange:
			row.target_low !== null && row.target_high !== null
				? { low: row.target_low, high: row.target_high }
				: undefined,
		estimatedMinutes: row.estimated_minutes,
		difficulty: row.difficulty
	};
}

interface RangeTestRow {
	id: string;
	mode: RangeTestMode;
	low_hz: number;
	high_hz: number;
	semitones: number;
	notes: string;
	created_at: number;
}

function toRangeTest(row: RangeTestRow): RangeTest {
	return {
		_id: row.id,
		mode: row.mode,
		lowHz: row.low_hz,
		highHz: row.high_hz,
		semitones: row.semitones,
		notes: row.notes,
		createdAt: new Date(row.created_at)
	};
}

interface PracticeDayRow {
	day: string;
	steps: string;
	started_at: number;
	updated_at: number;
	completed_at: number | null;
}

/** Steps travel as JSON; completedAt comes back as an ISO string and is revived here. */
function toPracticeDay(row: PracticeDayRow): PracticeDay {
	const steps = (
		JSON.parse(row.steps) as (Omit<PracticeStep, 'completedAt'> & {
			completedAt: string | null;
		})[]
	).map((s) => ({ ...s, completedAt: s.completedAt ? new Date(s.completedAt) : null }));
	return {
		_id: row.day,
		steps,
		startedAt: new Date(row.started_at),
		updatedAt: new Date(row.updated_at),
		completedAt: row.completed_at === null ? null : new Date(row.completed_at)
	};
}

function practiceDayParams(day: PracticeDay) {
	return {
		day: day._id,
		steps: JSON.stringify(day.steps),
		started_at: day.startedAt.getTime(),
		updated_at: day.updatedAt.getTime(),
		completed_at: day.completedAt ? day.completedAt.getTime() : null
	};
}

interface SettingsRow {
	id: string;
	target_low: number;
	target_high: number;
	created_at: number;
	updated_at: number;
}

const SETTINGS_ID = 'default';

function toSettings(row: SettingsRow): UserSettings {
	return {
		_id: row.id,
		targetRange: { low: row.target_low, high: row.target_high },
		createdAt: new Date(row.created_at),
		updatedAt: new Date(row.updated_at)
	};
}

// Session operations

/** Insert a session. `id` is for the importer, which keeps the ids an export carries. */
export async function createSession(data: Omit<Session, '_id'>, id = newId()): Promise<Session> {
	const database = getDatabase();
	database.transaction(() => {
		exec(
			database,
			`INSERT INTO sessions (${SESSION_COLUMNS})
			 VALUES ($id, $exercise_id, $title, $audio_key, $audio_type, $duration, $avg_pitch, $min_pitch, $max_pitch, $time_in_target_pct, $target_low, $target_high, $notes, $created_at)`,
			{
				id,
				exercise_id: data.exerciseId,
				title: data.title,
				audio_key: data.audioKey,
				audio_type: data.audioType ?? null,
				duration: data.duration,
				avg_pitch: data.pitchData.avgPitch,
				min_pitch: data.pitchData.minPitch,
				max_pitch: data.pitchData.maxPitch,
				time_in_target_pct: data.pitchData.timeInTargetPct,
				target_low: data.targetRange.low,
				target_high: data.targetRange.high,
				notes: data.notes,
				created_at: data.createdAt.getTime()
			}
		);
		exec(database, 'INSERT INTO session_points (session_id, points) VALUES ($id, $points)', {
			id,
			points: JSON.stringify(data.pitchData.points)
		});
	})();
	return { ...data, _id: id };
}

export async function sessionExists(id: string): Promise<boolean> {
	if (!isValidId(id)) return false;
	return (
		getDatabase()
			.query<{ id: string }, { id: string }>('SELECT id FROM sessions WHERE id = $id')
			.get({ id }) !== null
	);
}

export async function getSessionById(id: string): Promise<Session | null> {
	if (!isValidId(id)) return null;
	const database = getDatabase();
	const row = database
		.query<SessionRow & { points: string | null }, { id: string }>(
			`SELECT s.*, p.points FROM sessions s LEFT JOIN session_points p ON p.session_id = s.id WHERE s.id = $id`
		)
		.get({ id });
	if (!row) return null;
	const { points, ...session } = row;
	return toSession(session, points);
}

export interface ListSessionsResult {
	sessions: SessionSummary[];
	total: number;
}

/** Paginated sessions without their pitch points; use getSessionById for the full record. */
export async function listSessions(page = 1, limit = 20): Promise<ListSessionsResult> {
	const database = getDatabase();
	const rows = database
		.query<SessionRow, { limit: number; offset: number }>(
			`SELECT ${SESSION_COLUMNS} FROM sessions ORDER BY created_at DESC, id DESC LIMIT $limit OFFSET $offset`
		)
		.all({ limit, offset: (page - 1) * limit });
	return { sessions: rows.map(toSessionSummary), total: countSessions() };
}

function countSessions(): number {
	return getDatabase().query<{ n: number }, []>('SELECT COUNT(*) AS n FROM sessions').get()!.n;
}

export async function deleteSession(id: string): Promise<boolean> {
	if (!isValidId(id)) return false;
	// Bun counts cascaded rows (the points) in `changes`, hence >= 1.
	return exec(getDatabase(), 'DELETE FROM sessions WHERE id = $id', { id }).changes >= 1;
}

/** Every session in full, oldest first, one row at a time. */
export async function* iterateSessions(): AsyncGenerator<Session> {
	const database = getDatabase();
	const rows = database.query<SessionRow & { points: string | null }, []>(
		`SELECT s.*, p.points FROM sessions s LEFT JOIN session_points p ON p.session_id = s.id ORDER BY s.created_at ASC, s.id ASC`
	);
	for (const { points, ...row } of rows.iterate()) {
		yield toSession(row, points);
	}
}

/** Most recent sessions without their pitch points, for the dashboard. */
export async function getRecentSessions(limit = 5): Promise<SessionSummary[]> {
	return getDatabase()
		.query<SessionRow, { limit: number }>(
			`SELECT ${SESSION_COLUMNS} FROM sessions ORDER BY created_at DESC, id DESC LIMIT $limit`
		)
		.all({ limit })
		.map(toSessionSummary);
}

// Exercise operations

export async function listExercises(category?: string, difficulty?: string): Promise<Exercise[]> {
	const where: string[] = [];
	const params: Record<string, string> = {};
	if (category) {
		where.push('category = $category');
		params.category = category;
	}
	if (difficulty) {
		where.push('difficulty = $difficulty');
		params.difficulty = difficulty;
	}
	const rows = getDatabase()
		.query<ExerciseRow, Record<string, string>>(
			`SELECT * FROM exercises${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`
		)
		.all(params);
	// Sorted here rather than in SQL: a string sort would put "advanced" before
	// "beginner" and ignore CATEGORY_ORDER.
	return rows.map(toExercise).sort(compareExercises);
}

const DIFFICULTY_ORDER: Difficulty[] = ['beginner', 'intermediate', 'advanced'];

function rank<T>(order: readonly T[], value: T): number {
	const i = order.indexOf(value);
	return i === -1 ? order.length : i;
}

function compareExercises(a: Exercise, b: Exercise): number {
	return (
		rank(CATEGORY_ORDER, a.category) - rank(CATEGORY_ORDER, b.category) ||
		rank(DIFFICULTY_ORDER, a.difficulty) - rank(DIFFICULTY_ORDER, b.difficulty) ||
		a.title.localeCompare(b.title)
	);
}

export async function getExerciseById(id: string): Promise<Exercise | null> {
	if (!isValidId(id)) return null;
	const row = getDatabase()
		.query<ExerciseRow, { id: string }>('SELECT * FROM exercises WHERE id = $id')
		.get({ id });
	return row ? toExercise(row) : null;
}

export async function getExerciseByTitle(title: string): Promise<Exercise | null> {
	const row = getDatabase()
		.query<ExerciseRow, { title: string }>('SELECT * FROM exercises WHERE title = $title')
		.get({ title });
	return row ? toExercise(row) : null;
}

/** Insert one exercise under a given id; for the importer. Throws on a duplicate id or title. */
export async function insertExercise(exercise: Exercise): Promise<Exercise> {
	exec(
		getDatabase(),
		`INSERT INTO exercises (id, category, title, description, instructions, target_low, target_high, estimated_minutes, difficulty)
		 VALUES ($id, $category, $title, $description, $instructions, $target_low, $target_high, $estimated_minutes, $difficulty)`,
		{
			id: exercise._id,
			category: exercise.category,
			title: exercise.title,
			description: exercise.description,
			instructions: exercise.instructions,
			target_low: exercise.targetRange?.low ?? null,
			target_high: exercise.targetRange?.high ?? null,
			estimated_minutes: exercise.estimatedMinutes,
			difficulty: exercise.difficulty
		}
	);
	return exercise;
}

export interface UpsertExercisesResult {
	added: number;
	updated: number;
}

/**
 * Insert or update by title. Matching on title keeps existing ids stable, which
 * matters because sessions reference exercises by id. Exercises missing from
 * the list are left alone rather than deleted, for the same reason.
 */
export async function upsertExercises(
	list: Omit<Exercise, '_id'>[]
): Promise<UpsertExercisesResult> {
	const database = getDatabase();
	const before = countExercises();
	const upsert = database.prepare(
		`INSERT INTO exercises (id, category, title, description, instructions, target_low, target_high, estimated_minutes, difficulty)
		 VALUES ($id, $category, $title, $description, $instructions, $target_low, $target_high, $estimated_minutes, $difficulty)
		 ON CONFLICT (title) DO UPDATE SET
			category = excluded.category,
			description = excluded.description,
			instructions = excluded.instructions,
			target_low = excluded.target_low,
			target_high = excluded.target_high,
			estimated_minutes = excluded.estimated_minutes,
			difficulty = excluded.difficulty`
	);
	try {
		database.transaction(() => {
			for (const e of list) {
				upsert.run({
					id: newId(),
					category: e.category,
					title: e.title,
					description: e.description,
					instructions: e.instructions,
					target_low: e.targetRange?.low ?? null,
					target_high: e.targetRange?.high ?? null,
					estimated_minutes: e.estimatedMinutes,
					difficulty: e.difficulty
				});
			}
		})();
	} finally {
		upsert.finalize();
	}
	const added = countExercises() - before;
	return { added, updated: list.length - added };
}

function countExercises(): number {
	return getDatabase().query<{ n: number }, []>('SELECT COUNT(*) AS n FROM exercises').get()!.n;
}

// Settings operations

export async function getSettings(): Promise<UserSettings> {
	const row = getDatabase()
		.query<SettingsRow, { id: string }>('SELECT * FROM settings WHERE id = $id')
		.get({ id: SETTINGS_ID });
	if (row) return toSettings(row);
	// Defaults until the first save.
	const now = new Date();
	return { _id: SETTINGS_ID, targetRange: DEFAULT_TARGET_RANGE, createdAt: now, updatedAt: now };
}

export async function hasSettings(): Promise<boolean> {
	return (
		getDatabase()
			.query<{ id: string }, { id: string }>('SELECT id FROM settings WHERE id = $id')
			.get({ id: SETTINGS_ID }) !== null
	);
}

/** Write the settings row as given, timestamps included; for the importer. */
export async function putSettings(settings: UserSettings): Promise<UserSettings> {
	exec(
		getDatabase(),
		`INSERT INTO settings (id, target_low, target_high, created_at, updated_at)
		 VALUES ($id, $low, $high, $created, $updated)
		 ON CONFLICT (id) DO UPDATE SET target_low = excluded.target_low, target_high = excluded.target_high, created_at = excluded.created_at, updated_at = excluded.updated_at`,
		{
			id: SETTINGS_ID,
			low: settings.targetRange.low,
			high: settings.targetRange.high,
			created: settings.createdAt.getTime(),
			updated: settings.updatedAt.getTime()
		}
	);
	return { ...settings, _id: SETTINGS_ID };
}

export async function updateSettings(data: { targetRange: PitchRange }): Promise<UserSettings> {
	const now = Date.now();
	// One upsert on a fixed id, so two quick saves cannot race into two rows.
	const row = getDatabase()
		.query<SettingsRow, { id: string; low: number; high: number; now: number }>(
			`INSERT INTO settings (id, target_low, target_high, created_at, updated_at)
			 VALUES ($id, $low, $high, $now, $now)
			 ON CONFLICT (id) DO UPDATE SET target_low = excluded.target_low, target_high = excluded.target_high, updated_at = excluded.updated_at
			 RETURNING *`
		)
		.get({ id: SETTINGS_ID, low: data.targetRange.low, high: data.targetRange.high, now });
	if (!row) throw new Error('Settings upsert returned no row');
	return toSettings(row);
}

// Range test operations

export async function rangeTestExists(id: string): Promise<boolean> {
	if (!isValidId(id)) return false;
	return (
		getDatabase()
			.query<{ id: string }, { id: string }>('SELECT id FROM range_tests WHERE id = $id')
			.get({ id }) !== null
	);
}

export async function createRangeTest(
	data: Omit<RangeTest, '_id'>,
	id = newId()
): Promise<RangeTest> {
	exec(
		getDatabase(),
		`INSERT INTO range_tests (id, mode, low_hz, high_hz, semitones, notes, created_at)
		 VALUES ($id, $mode, $low_hz, $high_hz, $semitones, $notes, $created_at)`,
		{
			id,
			mode: data.mode,
			low_hz: data.lowHz,
			high_hz: data.highHz,
			semitones: data.semitones,
			notes: data.notes,
			created_at: data.createdAt.getTime()
		}
	);
	return { ...data, _id: id };
}

/** Every range test, oldest first. */
export async function listAllRangeTests(): Promise<RangeTest[]> {
	return getDatabase()
		.query<RangeTestRow, []>('SELECT * FROM range_tests ORDER BY created_at ASC, id ASC')
		.all()
		.map(toRangeTest);
}

/** Newest first. */
export async function listRangeTests(limit = 30): Promise<RangeTest[]> {
	return getDatabase()
		.query<RangeTestRow, { limit: number }>(
			'SELECT * FROM range_tests ORDER BY created_at DESC, id DESC LIMIT $limit'
		)
		.all({ limit })
		.map(toRangeTest);
}

/** Relabel which register a test measured, for fixing a mis-tagged result. */
export async function updateRangeTestMode(
	id: string,
	mode: RangeTestMode
): Promise<RangeTest | null> {
	if (!isValidId(id)) return null;
	const row = getDatabase()
		.query<RangeTestRow, { id: string; mode: string }>(
			'UPDATE range_tests SET mode = $mode WHERE id = $id RETURNING *'
		)
		.get({ id, mode });
	return row ? toRangeTest(row) : null;
}

export async function deleteRangeTest(id: string): Promise<boolean> {
	if (!isValidId(id)) return false;
	return exec(getDatabase(), 'DELETE FROM range_tests WHERE id = $id', { id }).changes >= 1;
}

// Practice day operations

function readPracticeDay(database: Database, day: string): PracticeDay | null {
	const row = database
		.query<PracticeDayRow, { day: string }>('SELECT * FROM practice_days WHERE day = $day')
		.get({ day });
	return row ? toPracticeDay(row) : null;
}

export async function getPracticeDay(day: string): Promise<PracticeDay | null> {
	return readPracticeDay(getDatabase(), day);
}

/** Insert a day as given; false if that day already exists. For the importer. */
export async function insertPracticeDay(day: PracticeDay): Promise<boolean> {
	return (
		exec(
			getDatabase(),
			`INSERT OR IGNORE INTO practice_days (day, steps, started_at, updated_at, completed_at)
			 VALUES ($day, $steps, $started_at, $updated_at, $completed_at)`,
			practiceDayParams(day)
		).changes === 1
	);
}

/**
 * The day's row, creating it from `fresh` if this is the first visit. Insert
 * OR IGNORE then read, in one transaction, so two tabs opening the page at the
 * same moment cannot create two competing days.
 */
export async function getOrCreatePracticeDay(fresh: PracticeDay): Promise<PracticeDay> {
	const database = getDatabase();
	return database
		.transaction(() => {
			exec(
				database,
				`INSERT OR IGNORE INTO practice_days (day, steps, started_at, updated_at, completed_at)
				 VALUES ($day, $steps, $started_at, $updated_at, $completed_at)`,
				practiceDayParams(fresh)
			);
			const day = readPracticeDay(database, fresh._id);
			if (!day) throw new Error('Practice day insert returned no row');
			return day;
		})
		.immediate();
}

/**
 * Read, apply a pure transform, write back, inside one write transaction. The
 * optimistic lock the Mongo version needed is what SQLite gives for free.
 */
function transformPracticeDay(
	day: string,
	transform: (current: PracticeDay, now: Date) => PracticeDay
): PracticeDay | null {
	const database = getDatabase();
	return database
		.transaction(() => {
			const current = readPracticeDay(database, day);
			if (!current) return null;
			const next = transform(current, new Date());
			exec(
				database,
				`UPDATE practice_days SET steps = $steps, started_at = $started_at, updated_at = $updated_at, completed_at = $completed_at WHERE day = $day`,
				practiceDayParams(next)
			);
			return next;
		})
		.immediate();
}

/** Apply a step update; null if the day does not exist. Throws RangeError on a bad index. */
export async function updatePracticeStep(
	day: string,
	index: number,
	update: StepUpdate
): Promise<PracticeDay | null> {
	return transformPracticeDay(day, (current, now) => applyStepUpdate(current, index, update, now));
}

export async function resetPracticeDaySteps(day: string): Promise<PracticeDay | null> {
	return transformPracticeDay(day, (current, now) => resetPracticeDay(current, now));
}

/** Newest first, summarised. For history views. */
export async function listPracticeDays(limit = 30): Promise<PracticeDaySummary[]> {
	return getDatabase()
		.query<PracticeDayRow, { limit: number }>(
			'SELECT * FROM practice_days ORDER BY day DESC LIMIT $limit'
		)
		.all({ limit })
		.map(toPracticeDay)
		.map(summarisePracticeDay);
}

/** Every practice day in full, oldest first. For the export. */
export async function listAllPracticeDays(): Promise<PracticeDay[]> {
	return getDatabase()
		.query<PracticeDayRow, []>('SELECT * FROM practice_days ORDER BY day ASC')
		.all()
		.map(toPracticeDay);
}

/** Day keys on which at least one step was done. Feeds the streak. */
function practicedDayKeys(): string[] {
	return getDatabase()
		.query<{ day: string }, []>(
			`SELECT day FROM practice_days
			 WHERE EXISTS (SELECT 1 FROM json_each(practice_days.steps) WHERE json_extract(value, '$.status') = 'done')`
		)
		.all()
		.map((r) => r.day);
}

// Dashboard stats

export interface DashboardStats {
	recentSessions: SessionSummary[];
	totalSessions: number;
	totalPracticeTime: number;
	practiceStreak: number;
	pitchTrend: { date: Date; avgHz: number }[];
	categoryBreakdown: { category: string; count: number }[];
	/** Today's routine progress, or null if the practice page has not been opened today. */
	todayPractice: PracticeDaySummary | null;
}

export async function getDashboardStats(): Promise<DashboardStats> {
	const database = getDatabase();

	const totals = database
		.query<{ total: number; seconds: number | null }, []>(
			'SELECT COUNT(*) AS total, SUM(duration) AS seconds FROM sessions'
		)
		.get()!;
	const sessionDays = database
		.query<{ created_at: number }, []>('SELECT created_at FROM sessions')
		.all()
		.map((r) => new Date(r.created_at));
	const pitchTrend = database
		.query<{ created_at: number; avg_pitch: number }, []>(
			'SELECT created_at, avg_pitch FROM sessions ORDER BY created_at DESC, id DESC LIMIT 30'
		)
		.all()
		.reverse()
		.map((r) => ({ date: new Date(r.created_at), avgHz: r.avg_pitch }));
	const categoryBreakdown = database
		.query<{ category: string; count: number }, []>(
			`SELECT e.category AS category, COUNT(*) AS count
			 FROM sessions s JOIN exercises e ON e.id = s.exercise_id
			 GROUP BY e.category ORDER BY e.category`
		)
		.all();
	const today = readPracticeDay(database, localDayKey(new Date()));

	return {
		recentSessions: await getRecentSessions(5),
		totalSessions: totals.total,
		totalPracticeTime: totals.seconds ?? 0,
		// A routine done without recording counts as practice just as much as a take.
		practiceStreak: calculateStreak([...sessionDays, ...practicedDayKeys()]),
		pitchTrend,
		categoryBreakdown,
		todayPractice: today ? summarisePracticeDay(today) : null
	};
}

/**
 * Consecutive practice days ending today or yesterday (a streak survives until
 * the end of the day after the last session).
 *
 * Each entry is either a session timestamp or a practice day key ("2026-09-03").
 * Days are local calendar days, matching the daily routine in routine.ts. The
 * previous implementation used UTC, so a session at 00:30 local time counted
 * for the day before and could silently break a streak.
 */
export function calculateStreak(practiced: (Date | string)[], now = new Date()): number {
	if (practiced.length === 0) return 0;

	const days = new Set(practiced.map((d) => (typeof d === 'string' ? d : localDayKey(d))));

	const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	// No session yet today is fine; start counting from yesterday in that case.
	if (!days.has(localDayKey(cursor))) {
		cursor.setDate(cursor.getDate() - 1);
	}

	let streak = 0;
	while (days.has(localDayKey(cursor))) {
		streak++;
		cursor.setDate(cursor.getDate() - 1);
	}
	return streak;
}
