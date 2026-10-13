import { describe, expect, test } from 'bun:test';
import { EXERCISE_TITLES, PURPOSES, exerciseTitle, stepPurpose } from '$lib/exerciseText';
import { EXERCISE_CONTENT, NB_NASAL_FREE_PASSAGE, localizeExercise } from './exerciseContent';
import { exercises } from './exercises';
import { baseLocale, locales } from '$lib/paraglide/runtime';

const englishTitles = exercises.map((e) => e.title).sort();

describe('exercise translations', () => {
	// These tables live outside Paraglide, so scripts/i18n.ts cannot see them: a
	// locale added to project.inlang fails here until its library is written.
	test.each(locales.filter((l) => l !== baseLocale))(
		'every exercise in the library has a title and text in %s',
		(locale) => {
			expect(Object.keys(EXERCISE_TITLES[locale] ?? {}).sort()).toEqual(englishTitles);
			expect(Object.keys(EXERCISE_CONTENT[locale] ?? {}).sort()).toEqual(englishTitles);
			for (const text of Object.values(EXERCISE_CONTENT[locale] ?? {})) {
				expect(text.description.trim()).not.toBe('');
				expect(text.instructions.trim()).not.toBe('');
			}
		}
	);

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
