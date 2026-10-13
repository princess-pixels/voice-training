import type { PageServerLoad } from './$types';
import { getSessionById, getExerciseById } from '$lib/server/db';
import { localizeExercise } from '$lib/server/exerciseContent';
import { error } from '@sveltejs/kit';
import { m } from '$lib/paraglide/messages';

export const load: PageServerLoad = async ({ params }) => {
	const session = await getSessionById(params.id);
	if (!session) error(404, { message: m.sessions_not_found() });

	let exercise = null;
	if (session.exerciseId) {
		exercise = await getExerciseById(session.exerciseId);
	}

	return { session, exercise: exercise && localizeExercise(exercise) };
};
