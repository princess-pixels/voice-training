import type { Exercise, ExerciseCategory } from '$lib/types';

export interface RoutineStep {
	exercise: Exercise;
	/** Why this slot exists, shown above the exercise so the shape of the session is legible. */
	purpose: string;
}

export interface DailyRoutine {
	steps: RoutineStep[];
	totalMinutes: number;
}

// The shape of a session: loosen up, find easy forward placement through the straw,
// do the day's technical work, then apply it to connected speech.
// Each slot alternates between two categories on odd/even days so the routine
// doesn't become the same four exercises forever.
const SLOTS: { categories: [ExerciseCategory, ExerciseCategory]; purpose: string }[] = [
	{
		categories: ['warmup', 'warmup'],
		purpose: 'Wake the voice up and release tension'
	},
	{
		categories: ['sovt', 'sovt'],
		purpose: 'Straw work — easy, low-strain resonance'
	},
	{
		categories: ['resonance', 'pitch'],
		purpose: "Today's technical focus"
	},
	{
		categories: ['reading', 'intonation'],
		purpose: 'Put it into real speech — worth recording'
	}
];

/** Whole days since the Unix epoch, in local time. Stable for a given calendar day. */
function dayNumber(date: Date): number {
	const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	return Math.floor(local.getTime() / 86_400_000);
}

/**
 * Build a deterministic routine for a given day.
 *
 * Deterministic matters: reloading the page mid-practice must not reshuffle the
 * routine underneath you, and "today's practice" should mean the same thing all day.
 * Rotating on the day number means consecutive days pull different exercises.
 */
export function buildDailyRoutine(exercises: Exercise[], date = new Date()): DailyRoutine {
	const day = dayNumber(date);

	const byCategory = new Map<ExerciseCategory, Exercise[]>();
	for (const exercise of exercises) {
		const list = byCategory.get(exercise.category) ?? [];
		list.push(exercise);
		byCategory.set(exercise.category, list);
	}
	// Sort each bucket by title so the rotation is stable across restarts,
	// regardless of what order the database hands the rows back in.
	for (const list of byCategory.values()) {
		list.sort((a, b) => a.title.localeCompare(b.title));
	}

	const steps: RoutineStep[] = [];
	const used = new Set<string>();

	SLOTS.forEach((slot, slotIndex) => {
		const category = slot.categories[day % 2];
		const candidates = (byCategory.get(category) ?? []).filter((e) => !used.has(e._id));
		if (candidates.length === 0) return;

		// Offset by slot index so two slots drawing the same category don't collide.
		const chosen = candidates[(day + slotIndex) % candidates.length];
		used.add(chosen._id);
		steps.push({ exercise: chosen, purpose: slot.purpose });
	});

	return {
		steps,
		totalMinutes: steps.reduce((sum, step) => sum + step.exercise.estimatedMinutes, 0)
	};
}
