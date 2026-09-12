import { DEFAULT_TARGET_RANGE } from '$lib/audio/utils';
import type { RequestHandler } from './$types';
import { createSession, isValidId, updatePracticeStep } from '$lib/server/db';
import { DAY_KEY } from '$lib/server/practice';
import { generateAudioKey, uploadAudio } from '$lib/server/audio';
import type { PitchData, PitchPoint, PitchRange } from '$lib/types';
import { summarisePitch } from '$lib/audio/stats';
import { json, error, isHttpError } from '@sveltejs/kit';

const DEFAULT_RANGE = DEFAULT_TARGET_RANGE;

// Generous ceilings. A 30-minute recording is ~15 MB of Opus and ~100k pitch
// points; anything past these is a bug or abuse, not practice.
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_PITCH_POINTS = 200_000;
const MAX_TITLE_LENGTH = 200;
const MAX_NOTES_LENGTH = 5000;
const MAX_DURATION_SECONDS = 4 * 60 * 60;

// e.g. audio/webm;codecs=opus or audio/mp4. Anything else falls back to the file's own type.
const AUDIO_TYPE = /^audio\/[A-Za-z0-9.+-]+(;[\w=.\- ]+)?$/;

function text(formData: FormData, key: string): string {
	const value = formData.get(key);
	return typeof value === 'string' ? value : '';
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

function parseRange(raw: string): PitchRange {
	if (!raw) return DEFAULT_RANGE;
	try {
		const parsed = JSON.parse(raw);
		if (isFiniteNumber(parsed?.low) && isFiniteNumber(parsed?.high) && parsed.low < parsed.high) {
			return { low: parsed.low, high: parsed.high };
		}
	} catch {
		// fall through
	}
	return DEFAULT_RANGE;
}

/** Validate the client-computed pitch data shape. Stats are recomputed from the points. */
function parsePitchData(raw: string): PitchData {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		error(400, { message: 'Invalid pitch data format' });
	}

	const candidate = parsed as { points?: unknown } | null;
	if (!candidate || !Array.isArray(candidate.points)) {
		error(400, { message: 'pitchData.points must be an array' });
	}
	if (candidate.points.length > MAX_PITCH_POINTS) {
		error(400, { message: `Too many pitch points (max ${MAX_PITCH_POINTS})` });
	}

	const points: PitchPoint[] = [];
	for (const p of candidate.points as unknown[]) {
		const point = p as Partial<PitchPoint> | null;
		if (
			!point ||
			!isFiniteNumber(point.t) ||
			!isFiniteNumber(point.hz) ||
			!isFiniteNumber(point.confidence)
		) {
			error(400, { message: 'Each pitch point needs numeric t, hz and confidence' });
		}
		points.push({ t: point.t, hz: point.hz, confidence: point.confidence });
	}

	return { points, ...summarisePitch(points, DEFAULT_RANGE) };
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const formData = await request.formData();

		const title = text(formData, 'title').trim().slice(0, MAX_TITLE_LENGTH);
		const notes = text(formData, 'notes').slice(0, MAX_NOTES_LENGTH);
		const exerciseId = text(formData, 'exerciseId');
		const audioFile = formData.get('audio');

		if (!title) {
			error(400, { message: 'Title is required' });
		}
		if (exerciseId && !isValidId(exerciseId)) {
			error(400, { message: 'Invalid exerciseId' });
		}

		// Optional: which practice step this take belongs to. Validated up front so a
		// bad reference fails before the audio is uploaded.
		const practiceDay = text(formData, 'practiceDay');
		const practiceStepRaw = text(formData, 'practiceStep');
		const practiceStep = practiceStepRaw === '' ? null : Number(practiceStepRaw);
		if (practiceDay && !DAY_KEY.test(practiceDay)) {
			error(400, { message: 'Invalid practiceDay' });
		}
		if (
			practiceDay &&
			(practiceStep === null || !Number.isInteger(practiceStep) || practiceStep < 0)
		) {
			error(400, { message: 'practiceStep must be a step index' });
		}

		const pitchDataRaw = text(formData, 'pitchData');
		if (!pitchDataRaw) {
			error(400, { message: 'Pitch data is required' });
		}

		const targetRange = parseRange(text(formData, 'targetRange'));
		const pitchData = parsePitchData(pitchDataRaw);
		// Stats depend on the target range, so finish them once the range is known.
		Object.assign(pitchData, summarisePitch(pitchData.points, targetRange));

		const duration = Math.min(
			MAX_DURATION_SECONDS,
			Math.max(0, Math.floor(Number(text(formData, 'duration')) || 0))
		);

		let audioKey = 'placeholder-audio-key';
		let audioType: string | undefined;
		if (audioFile instanceof File && audioFile.size > 0) {
			if (audioFile.size > MAX_AUDIO_BYTES) {
				error(413, { message: 'Audio file too large' });
			}
			// Prefer the type the client declared: multipart parsers (Bun included) can
			// replace the part's Content-Type with a guess from the filename.
			const declared = text(formData, 'audioType');
			audioType = AUDIO_TYPE.test(declared) ? declared : audioFile.type || 'audio/webm';
			audioKey = generateAudioKey(`temp-${Date.now()}`, audioType);
			await uploadAudio(audioKey, await audioFile.arrayBuffer(), audioType);
		}

		const session = await createSession({
			exerciseId: exerciseId || null,
			title,
			audioKey,
			audioType,
			duration,
			pitchData,
			targetRange,
			notes,
			createdAt: new Date()
		});

		// Attach the take to its practice step. The session is already saved, so a
		// missing day or step must not turn into a failed save: log and carry on.
		if (practiceDay && practiceStep !== null) {
			try {
				const day = await updatePracticeStep(practiceDay, practiceStep, {
					sessionId: session._id,
					addSeconds: duration
				});
				if (!day) console.warn(`Session ${session._id}: practice day ${practiceDay} not found`);
			} catch (err) {
				console.warn(`Session ${session._id}: could not attach to practice step`, err);
			}
		}

		return json({
			success: true,
			id: session._id,
			session
		});
	} catch (err) {
		if (isHttpError(err)) throw err;
		console.error('Error creating session:', err);
		error(500, { message: 'Failed to create session' });
	}
};
