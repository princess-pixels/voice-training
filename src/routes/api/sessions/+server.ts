import type { RequestHandler } from './$types';
import { createSession } from '$lib/server/db';
import { deleteAudio, generateAudioKey, isAudioType, uploadAudio } from '$lib/server/audio';
import { validated } from '$lib/server/http';
import { checkAudioSize, parseSessionForm } from '$lib/server/validate';
import { json } from '@sveltejs/kit';
import type { Session } from '$lib/types';

/**
 * Save a take: multipart with the pitch track and range as JSON strings and
 * the recording as a file part. Attaching a take to a practice step is the
 * practice page's job, through PATCH /api/practice/[day] once this returns.
 * The rules are in validate.ts; this is the adapter.
 */
export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	// Everything is checked before the audio is written, so a bad reference never
	// leaves a recording on disk.
	const fields = validated(() => parseSessionForm(formData));
	const audioFile = formData.get('audio');

	let audioKey = 'placeholder-audio-key';
	let audioType: string | undefined;
	if (audioFile instanceof File && audioFile.size > 0) {
		validated(() => checkAudioSize(audioFile.size));
		// Prefer the type the client declared: multipart parsers (Bun included) can
		// replace the part's Content-Type with a guess from the filename. Either
		// way it has to be an audio type; a guessed text/html would otherwise be
		// served back as such from the audio route.
		const declared = formData.get('audioType');
		audioType = isAudioType(declared)
			? declared
			: isAudioType(audioFile.type)
				? audioFile.type
				: 'audio/webm';
		audioKey = generateAudioKey(`temp-${Date.now()}`, audioType);
		await uploadAudio(audioKey, await audioFile.arrayBuffer(), audioType);
	}

	let session: Session;
	try {
		session = await createSession({ ...fields, audioKey, audioType, createdAt: new Date() });
	} catch (err) {
		// No row, no recording: an upload that failed to save must not orphan a file.
		if (audioKey !== 'placeholder-audio-key') await deleteAudio(audioKey).catch(() => {});
		throw err;
	}

	return json({ success: true, id: session._id, session });
};
