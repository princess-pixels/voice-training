import type { PageServerLoad } from './$types';
import { listExercises } from '$lib/server/db';
import type { ExerciseCategory, Difficulty } from '$lib/types';

export const load: PageServerLoad = async ({ url }) => {
	const category = url.searchParams.get('category') as ExerciseCategory | null;
	const difficulty = url.searchParams.get('difficulty') as Difficulty | null;

	const exercises = await listExercises(category || undefined, difficulty || undefined);

	return { exercises, activeCategory: category, activeDifficulty: difficulty };
};
