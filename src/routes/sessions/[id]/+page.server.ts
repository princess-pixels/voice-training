import type { PageServerLoad } from './$types';
import { getSessionById, getExerciseById } from '$lib/server/db';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
	const session = await getSessionById(params.id);
	if (!session) error(404, { message: 'Session not found' });

	let exercise = null;
	if (session.exerciseId) {
		exercise = await getExerciseById(session.exerciseId);
	}

	return { session, exercise };
};
