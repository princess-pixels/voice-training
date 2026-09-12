import type { RequestHandler } from './$types';
import { getSessionById, deleteSession } from '$lib/server/db';
import { deleteAudio } from '$lib/server/audio';
import { json, error, isHttpError } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params }) => {
	try {
		const session = await getSessionById(params.id);

		if (!session) {
			error(404, { message: 'Session not found' });
		}

		return json(session);
	} catch (err) {
		if (isHttpError(err)) throw err;
		console.error('Error fetching session:', err);
		error(500, { message: 'Failed to fetch session' });
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	try {
		const session = await getSessionById(params.id);

		if (!session) {
			error(404, { message: 'Session not found' });
		}

		// Delete the recording first
		if (session.audioKey) {
			try {
				await deleteAudio(session.audioKey);
			} catch (audioErr) {
				console.error('Error deleting audio file:', audioErr);
				// Continue with session deletion even if audio deletion fails
			}
		}

		// Delete session from database
		const deleted = await deleteSession(params.id);

		if (!deleted) {
			error(500, { message: 'Failed to delete session' });
		}

		return json({ success: true });
	} catch (err) {
		if (isHttpError(err)) throw err;
		console.error('Error deleting session:', err);
		error(500, { message: 'Failed to delete session' });
	}
};
