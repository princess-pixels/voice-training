import type { RequestHandler } from './$types';
import { getSessionById, deleteSession } from '$lib/server/db';
import { deleteAudio } from '$lib/server/audio';
import { json, error } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params }) => {
	const session = await getSessionById(params.id);
	if (!session) error(404, { message: 'Session not found' });
	return json(session);
};

export const DELETE: RequestHandler = async ({ params }) => {
	const session = await getSessionById(params.id);
	if (!session) error(404, { message: 'Session not found' });

	// Row first, then the file: a row whose recording is gone would 404 on
	// playback, while a file whose row is gone is merely disk to reclaim.
	const deleted = await deleteSession(params.id);
	if (!deleted) error(404, { message: 'Session not found' });
	try {
		await deleteAudio(session.audioKey);
	} catch (audioErr) {
		console.error(`Session ${params.id} deleted; its recording could not be removed:`, audioErr);
	}
	return json({ success: true });
};
