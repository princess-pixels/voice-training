import { $ } from 'bun';
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import type { Exercise, PracticeDay, RangeTest, Session, UserSettings } from '$lib/types';
import {
	createRangeTest,
	createSession,
	getExerciseByTitle,
	hasSettings,
	insertExercise,
	insertPracticeDay,
	isValidId,
	putSettings,
	rangeTestExists,
	sessionExists
} from './db';
import { deleteAudio, generateAudioKey, importAudio, isAudioType, isSafeAudioKey } from './audio';
import { EXPORT_FORMAT, type Manifest } from './exportLayout';

/**
 * Reads an export archive (see exportLayout.ts) into this install. Additive
 * and idempotent: rows that already exist are skipped, never overwritten, so
 * importing the same archive twice, or an archive on top of a library that
 * grew since, changes nothing it should not.
 *
 * Manifest v1 (no practiceDays) and v2 are both accepted.
 *
 * An archive is a trust boundary: it may have been made by someone else, and
 * every recording it carries ends up served from this install's own origin.
 * So the paths in the manifest are confined to the extracted directory, tar
 * symlinks are not followed, and a stored audio type has to be one.
 */

export interface ImportReport {
	manifestVersion: number;
	exportedAt: string;
	exercises: { matched: number; added: number };
	sessions: { added: number; skipped: number; failed: string[] };
	audio: { copied: number; missing: number };
	rangeTests: { added: number; skipped: number };
	practiceDays: { added: number; skipped: number };
	settings: 'imported' | 'kept';
}

/** Extract a .tar.gz export and import it. The archive itself is left alone. */
export async function importArchive(archivePath: string): Promise<ImportReport> {
	if (!Bun.which('tar')) throw new Error('Import needs the `tar` command');
	if (!(await Bun.file(archivePath).exists())) throw new Error(`No such file: ${archivePath}`);

	const dir = await mkdtemp(join(tmpdir(), 'voice-training-import-'));
	try {
		const result = await $`tar -xzf ${archivePath} -C ${dir}`.nothrow().quiet();
		if (result.exitCode !== 0) {
			throw new Error(`tar exited with ${result.exitCode}: ${result.stderr.toString().trim()}`);
		}
		return await importDirectory(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

type JsonDate<T> = { [K in keyof T]: T[K] extends Date | null ? string | null : T[K] };

/** Import an already-extracted export (a directory holding manifest.json). */
export async function importDirectory(dir: string): Promise<ImportReport> {
	// Canonical, so a symlinked tmpdir (macOS /var → /private/var) still
	// compares equal to the resolved paths of the files inside it.
	const root = await realpath(dir);
	const manifest = await readManifest(join(root, 'manifest.json'));

	const report: ImportReport = {
		manifestVersion: manifest.version,
		exportedAt: manifest.exportedAt,
		exercises: { matched: 0, added: 0 },
		sessions: { added: 0, skipped: 0, failed: [] },
		audio: { copied: 0, missing: 0 },
		rangeTests: { added: 0, skipped: 0 },
		practiceDays: { added: 0, skipped: 0 },
		settings: 'kept'
	};

	// Exercises first: sessions and practice steps point at them. The library is
	// seeded at boot under fresh ids, so an exported exercise is matched by title
	// and every reference to its old id is rewritten to the local one. A title
	// this install does not know is added under its old id, so nothing orphans.
	const exerciseIds = new Map<string, string>();
	for (const exercise of manifest.exercises) {
		const local = await getExerciseByTitle(exercise.title);
		if (local) {
			exerciseIds.set(exercise._id, local._id);
			report.exercises.matched++;
		} else {
			const _id = isValidId(exercise._id) ? exercise._id : Bun.randomUUIDv7();
			await insertExercise({ ...exercise, _id });
			exerciseIds.set(exercise._id, _id);
			report.exercises.added++;
		}
	}
	const remap = (id: string | null): string | null => (id ? (exerciseIds.get(id) ?? id) : null);

	for (const entry of manifest.sessions) {
		if (!isValidId(entry._id)) {
			report.sessions.failed.push(`${entry._id}: invalid id`);
			continue;
		}
		if (await sessionExists(entry._id)) {
			report.sessions.skipped++;
			continue;
		}
		// One bad session is reported and skipped, never allowed to abort the run
		// or to leave a recording behind without its row.
		let copiedKey: string | null = null;
		try {
			const file = await archiveFile(root, entry.file);
			if (!file) throw new Error('session file missing from archive');
			const session = await readSession(file);

			let audioKey = session.audioKey;
			const audioType = isAudioType(session.audioType) ? session.audioType : undefined;
			const source = entry.audioFile ? await archiveFile(root, entry.audioFile) : null;
			if (source) {
				if (!isSafeAudioKey(audioKey) || audioKey === 'placeholder-audio-key') {
					audioKey = generateAudioKey(session._id, audioType);
				}
				await importAudio(audioKey, source);
				copiedKey = audioKey;
			}

			const { _id, ...data } = session;
			await createSession(
				{ ...data, audioType, exerciseId: remap(data.exerciseId), audioKey },
				_id
			);
			report.sessions.added++;
			if (copiedKey) report.audio.copied++;
			else report.audio.missing++;
		} catch (err) {
			if (copiedKey) await deleteAudio(copiedKey);
			report.sessions.failed.push(`${entry._id}: ${(err as Error).message}`);
		}
	}

	for (const test of manifest.rangeTests) {
		if (!isValidId(test._id) || (await rangeTestExists(test._id))) {
			report.rangeTests.skipped++;
			continue;
		}
		const { _id, ...data } = reviveRangeTest(test);
		await createRangeTest(data, _id);
		report.rangeTests.added++;
	}

	for (const day of manifest.practiceDays) {
		const revived = revivePracticeDay(day);
		revived.steps = revived.steps.map((s) => ({
			...s,
			exerciseId: remap(s.exerciseId) ?? s.exerciseId
		}));
		if (await insertPracticeDay(revived)) report.practiceDays.added++;
		else report.practiceDays.skipped++;
	}

	if (!(await hasSettings())) {
		await putSettings(reviveSettings(manifest.settings));
		report.settings = 'imported';
	}

	return report;
}

/** The manifest as it sits in the JSON: dates are strings, v1 has no practiceDays. */
type RawManifest = Omit<Manifest, 'version' | 'settings' | 'rangeTests' | 'practiceDays'> & {
	version: number;
	settings: JsonDate<UserSettings>;
	rangeTests: JsonDate<RangeTest>[];
	practiceDays?: JsonDate<Omit<PracticeDay, 'steps'>>[] & { steps?: unknown }[];
};

type ValidManifest = Omit<RawManifest, 'practiceDays'> & { practiceDays: RawPracticeDay[] };
type RawPracticeDay = JsonDate<Omit<PracticeDay, 'steps'>> & {
	steps: (Omit<PracticeDay['steps'][number], 'completedAt'> & { completedAt: string | null })[];
};

async function readManifest(path: string): Promise<ValidManifest> {
	const file = Bun.file(path);
	if (!(await file.exists())) throw new Error('Not an export: manifest.json is missing');
	let raw: RawManifest;
	try {
		raw = await file.json();
	} catch {
		throw new Error('manifest.json is not valid JSON');
	}
	if (raw.format !== EXPORT_FORMAT) throw new Error(`Not a ${EXPORT_FORMAT} archive`);
	if (raw.version !== 1 && raw.version !== 2) {
		throw new Error(`Unsupported export version ${raw.version} (this build reads 1 and 2)`);
	}
	for (const key of ['exercises', 'sessions', 'rangeTests'] as const) {
		if (!Array.isArray(raw[key])) throw new Error(`manifest.${key} must be an array`);
	}
	if (raw.version === 2 && !Array.isArray(raw.practiceDays)) {
		throw new Error('manifest.practiceDays must be an array');
	}
	if (!raw.settings?.targetRange) throw new Error('manifest.settings is missing');
	return { ...raw, practiceDays: (raw.practiceDays ?? []) as RawPracticeDay[] };
}

/**
 * Resolve a manifest path to a regular file inside the extracted archive.
 * Null when the entry is absent (a recording the exporter could not find).
 * Throws when it points outside the archive or at anything but a plain file:
 * the manifest is attacker-controlled, tar extracts symlinks as symlinks, and
 * whatever this returns gets copied into the library and served.
 */
async function archiveFile(root: string, rel: unknown): Promise<string | null> {
	if (typeof rel !== 'string' || !rel) throw new Error('archive path must be a string');
	let real: string;
	try {
		real = await realpath(resolve(root, rel));
	} catch {
		return null;
	}
	if (!real.startsWith(root + sep)) throw new Error(`archive path escapes the archive: ${rel}`);
	if (!(await stat(real)).isFile()) throw new Error(`archive path is not a file: ${rel}`);
	return real;
}

async function readSession(path: string): Promise<Session> {
	const file = Bun.file(path);
	const raw = (await file.json()) as JsonDate<Session>;
	if (!Array.isArray(raw.pitchData?.points)) throw new Error('session file has no pitch points');
	return { ...raw, createdAt: date(raw.createdAt) };
}

function date(value: string | null | undefined): Date {
	const d = new Date(value ?? NaN);
	if (Number.isNaN(d.getTime())) throw new Error(`invalid date ${JSON.stringify(value)}`);
	return d;
}

function reviveRangeTest(raw: JsonDate<RangeTest>): RangeTest {
	// Tests predating the mode toggle measured the full range, falsetto included.
	return { ...raw, mode: raw.mode ?? 'full', createdAt: date(raw.createdAt) };
}

function revivePracticeDay(raw: RawPracticeDay): PracticeDay {
	return {
		_id: raw._id,
		steps: raw.steps.map((s) => ({
			...s,
			completedAt: s.completedAt ? date(s.completedAt) : null
		})),
		startedAt: date(raw.startedAt),
		updatedAt: date(raw.updatedAt),
		completedAt: raw.completedAt ? date(raw.completedAt) : null
	};
}

function reviveSettings(raw: JsonDate<UserSettings>): UserSettings {
	return {
		...raw,
		createdAt: date(raw.createdAt),
		updatedAt: date(raw.updatedAt)
	};
}

/** One line per section, for the CLI and the server log. */
export function formatReport(r: ImportReport): string {
	const lines = [
		`Export from ${r.exportedAt} (manifest v${r.manifestVersion})`,
		`  exercises      ${r.exercises.matched} matched by title, ${r.exercises.added} added`,
		`  sessions       ${r.sessions.added} added, ${r.sessions.skipped} already present`,
		`  recordings     ${r.audio.copied} copied, ${r.audio.missing} missing`,
		`  range tests    ${r.rangeTests.added} added, ${r.rangeTests.skipped} skipped`,
		`  practice days  ${r.practiceDays.added} added, ${r.practiceDays.skipped} already present`,
		`  settings       ${r.settings}`
	];
	for (const f of r.sessions.failed) lines.push(`  FAILED session ${f}`);
	return lines.join('\n');
}
