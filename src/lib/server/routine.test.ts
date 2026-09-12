import { describe, expect, test } from 'bun:test';
import { buildDailyRoutine } from './routine';
import type { Exercise, ExerciseCategory } from '$lib/types';

let nextId = 1;
function exercise(category: ExerciseCategory, title: string, minutes = 3): Exercise {
	return {
		_id: String(nextId++),
		category,
		title,
		description: '',
		instructions: '',
		estimatedMinutes: minutes,
		difficulty: 'beginner'
	};
}

const library: Exercise[] = [
	exercise('warmup', 'Lip trills', 2),
	exercise('warmup', 'Humming', 3),
	exercise('sovt', 'Straw sirens', 3),
	exercise('sovt', 'Straw glides', 3),
	exercise('pitch', 'Pitch holds', 4),
	exercise('resonance', 'Oral vs nasal', 4),
	exercise('reading', 'Passage', 5),
	exercise('intonation', 'Questions', 5)
];

const monday = new Date(2026, 8, 7, 10);
const tuesday = new Date(2026, 8, 8, 10);

describe('buildDailyRoutine', () => {
	test('builds the four-slot shape when every category is present', () => {
		const routine = buildDailyRoutine(library, monday);
		expect(routine.steps.map((s) => s.exercise.category)).toHaveLength(4);
		expect(routine.steps[0].exercise.category).toBe('warmup');
		expect(routine.steps[1].exercise.category).toBe('sovt');
		expect(['resonance', 'pitch']).toContain(routine.steps[2].exercise.category);
		expect(['reading', 'intonation']).toContain(routine.steps[3].exercise.category);
	});

	test('is deterministic for a given day, whatever order the library arrives in', () => {
		const a = buildDailyRoutine(library, monday);
		const b = buildDailyRoutine([...library].reverse(), monday);
		expect(a.steps.map((s) => s.exercise._id)).toEqual(b.steps.map((s) => s.exercise._id));
	});

	test('is stable across a day, including just before midnight', () => {
		const morning = buildDailyRoutine(library, new Date(2026, 8, 7, 0, 1));
		const night = buildDailyRoutine(library, new Date(2026, 8, 7, 23, 59));
		expect(morning.steps.map((s) => s.exercise._id)).toEqual(
			night.steps.map((s) => s.exercise._id)
		);
	});

	test('rotates the technical focus between consecutive days', () => {
		const a = buildDailyRoutine(library, monday).steps[2].exercise.category;
		const b = buildDailyRoutine(library, tuesday).steps[2].exercise.category;
		expect(a).not.toBe(b);
	});

	test('never uses the same exercise twice', () => {
		const ids = buildDailyRoutine(library, monday).steps.map((s) => s.exercise._id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	test('sums the estimated minutes', () => {
		const routine = buildDailyRoutine(library, monday);
		const expected = routine.steps.reduce((sum, s) => sum + s.exercise.estimatedMinutes, 0);
		expect(routine.totalMinutes).toBe(expected);
	});

	test('skips a slot whose category has no exercises instead of failing', () => {
		const noSovt = library.filter((e) => e.category !== 'sovt');
		const routine = buildDailyRoutine(noSovt, monday);
		expect(routine.steps).toHaveLength(3);
		expect(routine.steps.some((s) => s.exercise.category === 'sovt')).toBe(false);
	});

	test('returns an empty routine for an empty library', () => {
		expect(buildDailyRoutine([], monday)).toEqual({ steps: [], totalMinutes: 0 });
	});
});
