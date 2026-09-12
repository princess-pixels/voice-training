import {
	getOrCreatePracticeDay,
	getSettings,
	listExercises,
	listPracticeDays
} from '$lib/server/db';
import { newPracticeDay } from '$lib/server/practice';
import { buildDailyRoutine } from '$lib/server/routine';
import type { Exercise } from '$lib/types';
import type { PageServerLoad } from './$types';

/** Days shown in the history strip under the routine. */
const HISTORY_DAYS = 14;

export const load: PageServerLoad = async () => {
	const [exercises, settings, history] = await Promise.all([
		listExercises(),
		getSettings(),
		listPracticeDays(HISTORY_DAYS)
	]);
	const routine = buildDailyRoutine(exercises);

	// Nothing to practise, nothing to record. The page shows the empty-library notice.
	if (routine.steps.length === 0) {
		return { day: null, exercises: {} as Record<string, Exercise>, settings, history };
	}

	// Opening the page is what starts the day: the stored document is the truth
	// from here on, even if the library changes before midnight.
	const day = await getOrCreatePracticeDay(newPracticeDay(routine));
	const wanted = new Set(day.steps.map((s) => s.exerciseId));
	const byId: Record<string, Exercise> = {};
	for (const exercise of exercises) {
		if (wanted.has(exercise._id)) byId[exercise._id] = exercise;
	}
	return { day, exercises: byId, settings, history };
};
