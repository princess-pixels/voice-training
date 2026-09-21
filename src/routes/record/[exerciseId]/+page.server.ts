import type { PageServerLoad } from './$types';
import { getExerciseById, getSettings } from '$lib/server/db';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
	const [exercise, settings] = await Promise.all([
		getExerciseById(params.exerciseId),
		getSettings()
	]);
	if (!exercise) error(404, { message: 'Exercise not found' });
	return { exercise, settings };
};
