import { describe, expect, test } from 'bun:test';
import type { JsonDate, PracticeDay } from './types';
import { isPracticed, nextStepIndex, revivePracticeDay } from './practiceDay';

const wire: JsonDate<PracticeDay> = {
	_id: '2026-09-03',
	steps: [
		{
			exerciseId: '6a9886eb5c484718d059a056',
			title: 'Breath',
			category: 'warmup',
			purpose: 'p',
			status: 'done',
			seconds: 44,
			sessionIds: [],
			completedAt: '2026-09-03T20:59:18.360Z'
		},
		{
			exerciseId: '6a9886eb5c484718d059a057',
			title: 'Straw hum',
			category: 'sovt',
			purpose: 'p',
			status: 'pending',
			seconds: 0,
			sessionIds: [],
			completedAt: null
		}
	],
	startedAt: '2026-09-03T20:49:08.104Z',
	updatedAt: '2026-09-03T21:05:52.154Z',
	completedAt: null
};

describe('revivePracticeDay', () => {
	test('turns every date string back into a Date, nulls included', () => {
		const day = revivePracticeDay(wire);
		expect(day.startedAt).toEqual(new Date('2026-09-03T20:49:08.104Z'));
		expect(day.updatedAt).toEqual(new Date('2026-09-03T21:05:52.154Z'));
		expect(day.completedAt).toBeNull();
		expect(day.steps[0].completedAt).toEqual(new Date('2026-09-03T20:59:18.360Z'));
		expect(day.steps[1].completedAt).toBeNull();
		// Everything else rides through untouched.
		expect(day._id).toBe('2026-09-03');
		expect(day.steps[0].seconds).toBe(44);
	});

	test('a finished day keeps its completion time', () => {
		const day = revivePracticeDay({ ...wire, completedAt: '2026-09-03T21:05:52.154Z' });
		expect(day.completedAt).toEqual(new Date('2026-09-03T21:05:52.154Z'));
	});

	test('the revived day works with the other helpers', () => {
		const day = revivePracticeDay(wire);
		expect(isPracticed(day)).toBe(true);
		expect(nextStepIndex(day)).toBe(1);
	});
});
