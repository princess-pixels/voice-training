import { $ } from 'bun';
import { localDayKey } from '$lib/days';
import type {
	Exercise,
	PracticeDay,
	RangeTest,
	Session,
	SessionSummary,
	UserSettings
} from '$lib/types';
import { audioExtension } from './audio';

/**
 * The shape of an export archive: paths, manifest entries and the packer.
 * Pure apart from packDirectory, so it is fully covered by bun test; the
 * builder that needs the database and the audio files lives in export.ts.
 */

export const EXPORT_FORMAT = 'voice-training-export';
// 2: manifest gained practiceDays.
export const EXPORT_VERSION = 2;

export interface ManifestSession extends SessionSummary {
	/** Path inside the archive of the full session record, pitch points included. */
	file: string;
	/** Path inside the archive of the recording, or null if the object was missing. */
	audioFile: string | null;
}

export interface Manifest {
	format: typeof EXPORT_FORMAT;
	version: typeof EXPORT_VERSION;
	exportedAt: string;
	app: string;
	settings: UserSettings;
	exercises: Exercise[];
	sessions: ManifestSession[];
	rangeTests: RangeTest[];
	practiceDays: PracticeDay[];
}

export function sessionJsonPath(session: Pick<Session, '_id'>): string {
	return `sessions/${session._id}.json`;
}

export function sessionAudioPath(session: Pick<Session, '_id' | 'audioType'>): string {
	return `audio/${session._id}.${audioExtension(session.audioType)}`;
}

/** Builds the manifest entry for one session; pitch points stay in the per-session file. */
export function manifestSession(session: Session, hasAudio: boolean): ManifestSession {
	const { pitchData, ...rest } = session;
	const { points: _points, ...summary } = pitchData;
	return {
		...rest,
		pitchData: summary,
		file: sessionJsonPath(session),
		audioFile: hasAudio ? sessionAudioPath(session) : null
	};
}

export function archiveFileName(now = new Date()): string {
	return `voice-training-export-${localDayKey(now)}.tar.gz`;
}

/** tar -czf, streaming from disk. Entries are named relative to `dir`, no leading "./". */
export async function packDirectory(
	dir: string,
	archivePath: string,
	entries: string[]
): Promise<void> {
	const result = await $`tar -czf ${archivePath} -C ${dir} ${entries}`.nothrow().quiet();
	if (result.exitCode !== 0) {
		throw new Error(`tar exited with ${result.exitCode}: ${result.stderr.toString().trim()}`);
	}
}
