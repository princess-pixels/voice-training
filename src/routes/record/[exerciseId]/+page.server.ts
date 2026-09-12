import type { PageServerLoad } from './$types';
import { getExerciseById, getSettings } from '$lib/server/db';
import { DAY_KEY } from '$lib/server/practice';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params, url }) => {
	const [exercise, settings] = await Promise.all([
		getExerciseById(params.exerciseId),
		getSettings()
	]);
	if (!exercise) error(404, { message: 'Exercise not found' });

	// ?day=2026-09-03&step=2 means "this take belongs to that practice step".
	// Anything malformed is treated as a free recording rather than an error.
	const day = url.searchParams.get('day') ?? '';
	const step = Number(url.searchParams.get('step'));
	const practice = DAY_KEY.test(day) && Number.isInteger(step) && step >= 0 ? { day, step } : null;

	return { exercise, settings, practice };
};
