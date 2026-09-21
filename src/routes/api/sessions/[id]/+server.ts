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

	// Delete the recording first
	if (session.audioKey) {
		try {
			await deleteAudio(session.audioKey);
		} catch (audioErr) {
			console.error('Error deleting audio file:', audioErr);
			// Continue with session deletion even if audio deletion fails
		}
	}

	const deleted = await deleteSession(params.id);
	if (!deleted) error(500, { message: 'Failed to delete session' });
	return json({ success: true });
};
