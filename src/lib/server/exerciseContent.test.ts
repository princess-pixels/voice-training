import { describe, expect, test } from 'bun:test';
import { EXERCISE_TITLES, PURPOSES, exerciseTitle, stepPurpose } from '$lib/exerciseText';
import { EXERCISE_CONTENT, NB_NASAL_FREE_PASSAGE, localizeExercise } from './exerciseContent';
import { exercises } from './exercises';

const englishTitles = exercises.map((e) => e.title).sort();

describe('exercise translations', () => {
	test('every exercise in the library has a Norwegian title and text', () => {
		expect(Object.keys(EXERCISE_TITLES.nb!).sort()).toEqual(englishTitles);
		expect(Object.keys(EXERCISE_CONTENT.nb!).sort()).toEqual(englishTitles);
		for (const text of Object.values(EXERCISE_CONTENT.nb!)) {
			expect(text.description.trim()).not.toBe('');
			expect(text.instructions.trim()).not.toBe('');
		}
	});

	test('the nasal-free passage has no nasal consonants in Norwegian either', () => {
		expect(NB_NASAL_FREE_PASSAGE).not.toMatch(/[mn]/i);
	});

	test('localizeExercise lays the translation over the English and keeps the rest', () => {
		const english = exercises.find((e) => e.title === 'Big Dog, Small Dog')!;
		const norwegian = localizeExercise(english, 'nb');
		expect(norwegian.title).toBe('Stor hund, liten hund');
		expect(norwegian.instructions).toContain('voff voff');
		expect(norwegian.category).toBe(english.category);
		expect(norwegian.estimatedMinutes).toBe(english.estimatedMinutes);
		expect(english.title).toBe('Big Dog, Small Dog');

		expect(localizeExercise(english, 'en')).toEqual(english);
		// The page's locale is English outside a request.
		expect(localizeExercise(english)).toEqual(english);
	});

	test('an exercise with no translation (imported, or newer than this table) stays English', () => {
		const custom = { title: 'My own warmup', description: 'd', instructions: 'i' };
		expect(localizeExercise(custom, 'nb')).toEqual(custom);
		expect(exerciseTitle('My own warmup', 'nb')).toBe('My own warmup');
	});

	test('stored routine purposes have a message, and unknown ones pass through', () => {
		for (const purpose of Object.values(PURPOSES)) expect(stepPurpose(purpose)).toBe(purpose);
		expect(stepPurpose('Something from an older version')).toBe('Something from an older version');
	});
});
