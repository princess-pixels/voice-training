import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Session } from '$lib/types';
import {
	archiveFileName,
	manifestSession,
	packDirectory,
	sessionAudioPath,
	sessionJsonPath
} from './exportLayout';

const session: Session = {
	_id: '66f0c0ffee0000000000abcd',
	exerciseId: null,
	title: 'Evening practice',
	audioKey: 'sessions/2026-09-03/66f0c0ffee0000000000abcd/x.webm',
	audioType: 'audio/mp4',
	duration: 42,
	pitchData: {
		points: [{ t: 0, hz: 200, confidence: 0.9 }],
		avgPitch: 200,
		medianPitch: 200,
		minPitch: 200,
		maxPitch: 200,
		timeInTargetPct: 100
	},
	targetRange: { low: 180, high: 300 },
	notes: '',
	createdAt: new Date('2026-09-03T18:00:00Z')
};

describe('export layout', () => {
	test('session files are keyed by id, audio by id and type', () => {
		expect(sessionJsonPath(session)).toBe('sessions/66f0c0ffee0000000000abcd.json');
		expect(sessionAudioPath(session)).toBe('audio/66f0c0ffee0000000000abcd.m4a');
		expect(sessionAudioPath({ _id: 'x', audioType: undefined })).toBe('audio/x.webm');
	});

	test('manifest entries carry the summary but not the points', () => {
		const entry = manifestSession(session, true);
		expect(entry.file).toBe('sessions/66f0c0ffee0000000000abcd.json');
		expect(entry.audioFile).toBe('audio/66f0c0ffee0000000000abcd.m4a');
		expect(entry.pitchData).toEqual({
			avgPitch: 200,
			medianPitch: 200,
			minPitch: 200,
			maxPitch: 200,
			timeInTargetPct: 100
		});
		expect('points' in entry.pitchData).toBe(false);
		expect(manifestSession(session, false).audioFile).toBeNull();
	});

	test('archive name carries the local date', () => {
		// 23:59 local on the 3rd, whatever UTC thinks the date is.
		expect(archiveFileName(new Date(2026, 8, 3, 23, 59))).toBe(
			'voice-training-export-2026-09-03.tar.gz'
		);
	});
});

describe('packDirectory', () => {
	test('entries come back under their relative paths, gzipped, contents intact', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'vt-export-test-'));
		try {
			await mkdir(join(dir, 'stage', 'sessions'), { recursive: true });
			await Bun.write(join(dir, 'stage', 'manifest.json'), '{"m":true}');
			await Bun.write(join(dir, 'stage', 'sessions', 'a.json'), '{"a":1}');
			const out = join(dir, 'out.tar.gz');
			await packDirectory(join(dir, 'stage'), out, ['manifest.json', 'sessions']);

			const bytes = await Bun.file(out).bytes();
			expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]); // gzip magic
			const files = await new Bun.Archive(bytes).files();
			expect([...files.keys()].sort()).toEqual(['manifest.json', 'sessions/a.json']);
			expect(await files.get('sessions/a.json')!.text()).toBe('{"a":1}');
			expect(await files.get('manifest.json')!.text()).toBe('{"m":true}');
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
