import { $ } from 'bun';
import { mkdtemp, realpath, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import type { UserSettings } from '$lib/types';
import {
	createRangeTest,
	createSession,
	getExerciseByTitle,
	hasSettings,
	insertExercise,
	insertPracticeDay,
	putSettings,
	rangeTestExists,
	sessionExists
} from './db';
import { deleteAudio, generateAudioKey, importAudio, isAudioType, isSafeAudioKey } from './audio';
import { EXPORT_FORMAT } from './exportLayout';
import {
	asRecord,
	isRecord,
	isValidId,
	parseExerciseRecord,
	parsePracticeDayRecord,
	parseRangeTestRecord,
	parseSessionRecord,
	parseSettingsRecord
} from './validate';

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
 * symlinks are not followed, a stored audio type has to be one, and every
 * record is held to the same rules as the API routes (validate.ts). One bad
 * record is reported in the run's report and skipped; it never aborts the run.
 */

export interface ImportReport {
	manifestVersion: number;
	exportedAt: string;
	exercises: { matched: number; added: number; failed: string[] };
	sessions: { added: number; skipped: number; failed: string[] };
	audio: { copied: number; missing: number };
	rangeTests: { added: number; skipped: number; failed: string[] };
	practiceDays: { added: number; skipped: number; failed: string[] };
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

/** Import an already-extracted export (a directory holding manifest.json). */
export async function importDirectory(dir: string): Promise<ImportReport> {
	// Canonical, so a symlinked tmpdir (macOS /var → /private/var) still
	// compares equal to the resolved paths of the files inside it.
	const root = await realpath(dir);
	const manifest = await readManifest(join(root, 'manifest.json'));

	const report: ImportReport = {
		manifestVersion: manifest.version,
		exportedAt: manifest.exportedAt,
		exercises: { matched: 0, added: 0, failed: [] },
		sessions: { added: 0, skipped: 0, failed: [] },
		audio: { copied: 0, missing: 0 },
		rangeTests: { added: 0, skipped: 0, failed: [] },
		practiceDays: { added: 0, skipped: 0, failed: [] },
		settings: 'kept'
	};
	const label = (raw: unknown) => (isRecord(raw) && typeof raw._id === 'string' ? raw._id : '?');
	const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

	// Exercises first: sessions and practice steps point at them. The library is
	// seeded at boot under fresh ids, so an exported exercise is matched by title
	// and every reference to its old id is rewritten to the local one. A title
	// this install does not know is added under its old id, so nothing orphans.
	const exerciseIds = new Map<string, string>();
	for (const raw of manifest.exercises) {
		try {
			const exercise = parseExerciseRecord(raw);
			const oldId = label(raw);
			const local = await getExerciseByTitle(exercise.title);
			if (local) {
				exerciseIds.set(oldId, local._id);
				report.exercises.matched++;
			} else {
				const _id = isValidId(oldId) ? oldId : Bun.randomUUIDv7();
				await insertExercise({ ...exercise, _id });
				exerciseIds.set(oldId, _id);
				report.exercises.added++;
			}
		} catch (err) {
			report.exercises.failed.push(`${label(raw)}: ${message(err)}`);
		}
	}
	const remap = (id: string | null): string | null => (id ? (exerciseIds.get(id) ?? id) : null);

	for (const raw of manifest.sessions) {
		const id = label(raw);
		if (!isValidId(id)) {
			report.sessions.failed.push(`${id}: invalid id`);
			continue;
		}
		if (await sessionExists(id)) {
			report.sessions.skipped++;
			continue;
		}
		// One bad session is reported and skipped, never allowed to abort the run
		// or to leave a recording behind without its row.
		let copiedKey: string | null = null;
		try {
			const entry = asRecord(raw, 'manifest session');
			const file = await archiveFile(root, entry.file);
			if (!file) throw new Error('session file missing from archive');
			const session = parseSessionRecord(await readJsonFile(file, 'session file'));

			let audioKey = session.audioKey;
			const audioType = isAudioType(session.audioType) ? session.audioType : undefined;
			const source = entry.audioFile ? await archiveFile(root, entry.audioFile) : null;
			if (source) {
				if (!isSafeAudioKey(audioKey) || audioKey === 'placeholder-audio-key') {
					audioKey = generateAudioKey(id, audioType);
				}
				await importAudio(audioKey, source);
				copiedKey = audioKey;
			} else {
				audioKey = 'placeholder-audio-key';
			}

			await createSession(
				{ ...session, audioType, exerciseId: remap(session.exerciseId), audioKey },
				id
			);
			report.sessions.added++;
			if (copiedKey) report.audio.copied++;
			else report.audio.missing++;
		} catch (err) {
			if (copiedKey) await deleteAudio(copiedKey);
			report.sessions.failed.push(`${id}: ${message(err)}`);
		}
	}

	for (const raw of manifest.rangeTests) {
		const id = label(raw);
		try {
			if (!isValidId(id) || (await rangeTestExists(id))) {
				report.rangeTests.skipped++;
				continue;
			}
			await createRangeTest(parseRangeTestRecord(raw), id);
			report.rangeTests.added++;
		} catch (err) {
			report.rangeTests.failed.push(`${id}: ${message(err)}`);
		}
	}

	for (const raw of manifest.practiceDays) {
		try {
			const day = parsePracticeDayRecord(raw);
			day.steps = day.steps.map((s) => ({ ...s, exerciseId: remap(s.exerciseId) ?? s.exerciseId }));
			if (await insertPracticeDay(day)) report.practiceDays.added++;
			else report.practiceDays.skipped++;
		} catch (err) {
			report.practiceDays.failed.push(`${label(raw)}: ${message(err)}`);
		}
	}

	if (!(await hasSettings())) {
		await putSettings(manifest.settings);
		report.settings = 'imported';
	}

	return report;
}

/** The manifest once its frame is checked. The records inside are still raw. */
interface ValidManifest {
	version: number;
	exportedAt: string;
	settings: UserSettings;
	exercises: unknown[];
	sessions: unknown[];
	rangeTests: unknown[];
	practiceDays: unknown[];
}

async function readManifest(path: string): Promise<ValidManifest> {
	const file = Bun.file(path);
	if (!(await file.exists())) throw new Error('Not an export: manifest.json is missing');
	const raw = asRecord(await readJsonFile(path, 'manifest.json'), 'manifest.json');
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
	if (!isRecord(raw.settings)) throw new Error('manifest.settings is missing');
	// Settings are the one record that fails the whole run: there is exactly one,
	// and importing a library with a broken target range would be worse than none.
	const settings = { ...parseSettingsRecord(raw.settings), _id: 'default' };
	return {
		version: raw.version,
		exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
		settings,
		exercises: raw.exercises as unknown[],
		sessions: raw.sessions as unknown[],
		rangeTests: raw.rangeTests as unknown[],
		practiceDays: Array.isArray(raw.practiceDays) ? (raw.practiceDays as unknown[]) : []
	};
}

async function readJsonFile(path: string, what: string): Promise<unknown> {
	try {
		return await Bun.file(path).json();
	} catch {
		throw new Error(`${what} is not valid JSON`);
	}
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
	for (const f of r.exercises.failed) lines.push(`  FAILED exercise ${f}`);
	for (const f of r.sessions.failed) lines.push(`  FAILED session ${f}`);
	for (const f of r.rangeTests.failed) lines.push(`  FAILED range test ${f}`);
	for (const f of r.practiceDays.failed) lines.push(`  FAILED practice day ${f}`);
	return lines.join('\n');
}
