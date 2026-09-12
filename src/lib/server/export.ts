import { mkdtemp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	getSettings,
	iterateSessions,
	listAllPracticeDays,
	listAllRangeTests,
	listExercises
} from './db';
import { downloadAudio } from './audio';
import {
	EXPORT_FORMAT,
	EXPORT_VERSION,
	manifestSession,
	packDirectory,
	sessionAudioPath,
	sessionJsonPath,
	type Manifest,
	type ManifestSession
} from './exportLayout';

/** The layout module is re-exported so the route needs a single import. */
export * from './exportLayout';

const TMP_PREFIX = 'voice-training-export-';
// A directory older than this belongs to a crashed export; sweep it on the next run.
const STALE_MS = 60 * 60 * 1000;

export interface ExportResult {
	/** Directory holding the archive and its inputs; remove it when done. */
	dir: string;
	/** The finished .tar.gz. */
	archivePath: string;
	manifest: Manifest;
}

function appVersion(): string {
	return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
}

/**
 * Gather everything into a staging directory and pack it as a gzip tarball.
 *
 * Nothing large is held in memory: each session record and each recording is
 * written to disk, and the system tar streams them into the archive.
 * Bun.Archive would be the native choice, but as of Bun 1.4.0 it writes
 * zero-byte entries for lazy Bun.file() values (only in-memory bytes work),
 * and reading a whole audio library into memory is not an option.
 */
export async function buildExport(): Promise<ExportResult> {
	if (!Bun.which('tar')) {
		throw new Error('Export needs the `tar` command on the server');
	}
	await sweepStaleExports();

	const dir = await mkdtemp(join(tmpdir(), TMP_PREFIX));
	const stage = join(dir, 'stage');
	await mkdir(join(stage, 'sessions'), { recursive: true });
	await mkdir(join(stage, 'audio'), { recursive: true });

	const [settings, exercises, rangeTests, practiceDays] = await Promise.all([
		getSettings(),
		listExercises(),
		listAllRangeTests(),
		listAllPracticeDays()
	]);

	const sessions: ManifestSession[] = [];

	for await (const session of iterateSessions()) {
		await Bun.write(join(stage, sessionJsonPath(session)), JSON.stringify(session));

		let hasAudio = false;
		if (session.audioKey) {
			hasAudio = await downloadAudio(session.audioKey, join(stage, sessionAudioPath(session)));
		}
		sessions.push(manifestSession(session, hasAudio));
	}

	const manifest: Manifest = {
		format: EXPORT_FORMAT,
		version: EXPORT_VERSION,
		exportedAt: new Date().toISOString(),
		app: appVersion(),
		settings,
		exercises,
		sessions,
		rangeTests,
		practiceDays
	};
	await Bun.write(join(stage, 'manifest.json'), JSON.stringify(manifest, null, 2));

	const archivePath = join(dir, 'export.tar.gz');
	await packDirectory(stage, archivePath, ['manifest.json', 'sessions', 'audio']);
	// The archive has everything now; the staging copies are dead weight.
	await rm(stage, { recursive: true, force: true });

	return { dir, archivePath, manifest };
}

async function sweepStaleExports(): Promise<void> {
	const root = tmpdir();
	let names: string[];
	try {
		names = await readdir(root);
	} catch {
		return;
	}
	const cutoff = Date.now() - STALE_MS;
	await Promise.all(
		names
			.filter((n) => n.startsWith(TMP_PREFIX))
			.map(async (n) => {
				const path = join(root, n);
				try {
					const info = await stat(path);
					if (info.mtimeMs < cutoff) await rm(path, { recursive: true, force: true });
				} catch {
					// Raced with another sweep or the directory is in use; leave it.
				}
			})
	);
}
