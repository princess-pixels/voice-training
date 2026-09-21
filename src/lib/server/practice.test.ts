import { describe, expect, test } from 'bun:test';
import type { Exercise, ExerciseCategory } from '$lib/types';
import type { DailyRoutine } from './routine';
import { dayKeysEndingAt } from '$lib/days';
import {
	applyStepUpdate,
	detachSession,
	isPracticed,
	localDayKey,
	newPracticeDay,
	nextStepIndex,
	resetPracticeDay,
	summarisePracticeDay
} from './practice';

function exercise(id: string, category: ExerciseCategory, title: string): Exercise {
	return {
		_id: id,
		category,
		title,
		description: '',
		instructions: '',
		estimatedMinutes: 3,
		difficulty: 'beginner'
	};
}

const routine: DailyRoutine = {
	steps: [
		{ exercise: exercise('a', 'warmup', 'Lip trills'), purpose: 'Wake up' },
		{ exercise: exercise('b', 'sovt', 'Straw sirens'), purpose: 'Straw' },
		{ exercise: exercise('c', 'reading', 'Passage'), purpose: 'Speech' }
	],
	totalMinutes: 9
};

// Local-time constructor, same reasoning as streak.test.ts.
const at = (hour: number, minute = 0) => new Date(2026, 8, 3, hour, minute);
const opened = at(21, 0);

describe('localDayKey', () => {
	test('is the local calendar day, zero padded', () => {
		expect(localDayKey(new Date(2026, 0, 5, 0, 30))).toBe('2026-01-05');
		expect(localDayKey(at(23, 59))).toBe('2026-09-03');
	});
});

describe('dayKeysEndingAt', () => {
	test('walks back across a month boundary, oldest first', () => {
		expect(dayKeysEndingAt('2026-09-02', 4)).toEqual([
			'2026-08-30',
			'2026-08-31',
			'2026-09-01',
			'2026-09-02'
		]);
	});
});

describe('newPracticeDay', () => {
	test('snapshots the routine with every step pending', () => {
		const day = newPracticeDay(routine, opened);
		expect(day._id).toBe('2026-09-03');
		expect(day.steps).toHaveLength(3);
		expect(day.steps[0]).toEqual({
			exerciseId: 'a',
			title: 'Lip trills',
			category: 'warmup',
			purpose: 'Wake up',
			status: 'pending',
			seconds: 0,
			sessionIds: [],
			completedAt: null
		});
		expect(day.startedAt).toBe(opened);
		expect(day.completedAt).toBeNull();
	});
});

describe('applyStepUpdate', () => {
	const fresh = newPracticeDay(routine, opened);

	test('marks a step done with a completion time and adds seconds', () => {
		const day = applyStepUpdate(fresh, 0, { status: 'done', addSeconds: 90 }, at(21, 2));
		expect(day.steps[0].status).toBe('done');
		expect(day.steps[0].seconds).toBe(90);
		expect(day.steps[0].completedAt).toEqual(at(21, 2));
		expect(day.updatedAt).toEqual(at(21, 2));
		expect(day.completedAt).toBeNull();
	});

	test('does not mutate the input', () => {
		const before = structuredClone(fresh);
		applyStepUpdate(fresh, 0, { status: 'done' }, at(21, 2));
		expect(fresh).toEqual(before);
	});

	test('accumulates seconds across attempts and ignores negative values', () => {
		let day = applyStepUpdate(fresh, 1, { addSeconds: 30 }, at(21, 1));
		day = applyStepUpdate(day, 1, { addSeconds: 45 }, at(21, 2));
		day = applyStepUpdate(day, 1, { addSeconds: -10 }, at(21, 3));
		expect(day.steps[1].seconds).toBe(75);
		expect(day.steps[1].status).toBe('pending');
	});

	test('attaching a session marks the step done and never duplicates the id', () => {
		let day = applyStepUpdate(fresh, 2, { sessionId: 's1' }, at(21, 5));
		expect(day.steps[2].status).toBe('done');
		expect(day.steps[2].sessionIds).toEqual(['s1']);
		day = applyStepUpdate(day, 2, { sessionId: 's1' }, at(21, 6));
		day = applyStepUpdate(day, 2, { sessionId: 's2' }, at(21, 7));
		expect(day.steps[2].sessionIds).toEqual(['s1', 's2']);
	});

	test('an explicit status wins over the session default', () => {
		const day = applyStepUpdate(fresh, 2, { sessionId: 's1', status: 'pending' }, at(21, 5));
		expect(day.steps[2].status).toBe('pending');
		expect(day.steps[2].sessionIds).toEqual(['s1']);
	});

	test('keeps the first completion time when a done step is touched again', () => {
		let day = applyStepUpdate(fresh, 0, { status: 'done' }, at(21, 2));
		day = applyStepUpdate(day, 0, { addSeconds: 10 }, at(21, 9));
		expect(day.steps[0].completedAt).toEqual(at(21, 2));
	});

	test('reopening a step clears its completion time', () => {
		let day = applyStepUpdate(fresh, 0, { status: 'done' }, at(21, 2));
		day = applyStepUpdate(day, 0, { status: 'pending' }, at(21, 3));
		expect(day.steps[0].completedAt).toBeNull();
	});

	test('the day completes once every step is done or skipped, and reopens', () => {
		let day = applyStepUpdate(fresh, 0, { status: 'done' }, at(21, 2));
		day = applyStepUpdate(day, 1, { status: 'skipped' }, at(21, 3));
		expect(day.completedAt).toBeNull();
		day = applyStepUpdate(day, 2, { status: 'done' }, at(21, 10));
		expect(day.completedAt).toEqual(at(21, 10));

		// Touching a finished day keeps the original completion time.
		day = applyStepUpdate(day, 2, { addSeconds: 5 }, at(21, 12));
		expect(day.completedAt).toEqual(at(21, 10));

		day = applyStepUpdate(day, 1, { status: 'pending' }, at(21, 15));
		expect(day.completedAt).toBeNull();
	});

	test('rejects an index outside the routine', () => {
		expect(() => applyStepUpdate(fresh, 3, { status: 'done' })).toThrow(RangeError);
		expect(() => applyStepUpdate(fresh, -1, { status: 'done' })).toThrow(RangeError);
		expect(() => applyStepUpdate(fresh, 1.5, { status: 'done' })).toThrow(RangeError);
	});
});

describe('resetPracticeDay', () => {
	test('puts every step back to pending but keeps time and recordings', () => {
		let day = newPracticeDay(routine, opened);
		day = applyStepUpdate(day, 0, { status: 'done', addSeconds: 60 }, at(21, 1));
		day = applyStepUpdate(day, 1, { status: 'skipped' }, at(21, 2));
		day = applyStepUpdate(day, 2, { sessionId: 's1', addSeconds: 120 }, at(21, 5));
		expect(day.completedAt).not.toBeNull();

		const reset = resetPracticeDay(day, at(21, 6));
		expect(reset.steps.map((s) => s.status)).toEqual(['pending', 'pending', 'pending']);
		expect(reset.steps.map((s) => s.completedAt)).toEqual([null, null, null]);
		expect(reset.steps[0].seconds).toBe(60);
		expect(reset.steps[2].sessionIds).toEqual(['s1']);
		expect(reset.completedAt).toBeNull();
		expect(reset.updatedAt).toEqual(at(21, 6));
	});
});

describe('summarisePracticeDay, isPracticed, nextStepIndex', () => {
	test('a fresh day', () => {
		const day = newPracticeDay(routine, opened);
		expect(summarisePracticeDay(day)).toEqual({
			day: '2026-09-03',
			doneSteps: 0,
			totalSteps: 3,
			seconds: 0,
			complete: false
		});
		expect(isPracticed(day)).toBe(false);
		expect(nextStepIndex(day)).toBe(0);
	});

	test('a day in progress skips ahead to the first pending step', () => {
		let day = newPracticeDay(routine, opened);
		day = applyStepUpdate(day, 0, { status: 'done', addSeconds: 60 }, at(21, 1));
		day = applyStepUpdate(day, 1, { status: 'skipped', addSeconds: 5 }, at(21, 2));
		expect(summarisePracticeDay(day)).toMatchObject({
			doneSteps: 1,
			seconds: 65,
			complete: false
		});
		expect(isPracticed(day)).toBe(true);
		expect(nextStepIndex(day)).toBe(2);
	});

	test('a finished day lands on the last step', () => {
		let day = newPracticeDay(routine, opened);
		for (let i = 0; i < 3; i++) day = applyStepUpdate(day, i, { status: 'done' }, at(21, i));
		expect(summarisePracticeDay(day).complete).toBe(true);
		expect(nextStepIndex(day)).toBe(2);
	});

	test('a day of nothing but skips is not practice', () => {
		let day = newPracticeDay(routine, opened);
		for (let i = 0; i < 3; i++) day = applyStepUpdate(day, i, { status: 'skipped' }, at(21, i));
		expect(isPracticed(day)).toBe(false);
		expect(summarisePracticeDay(day).complete).toBe(true);
	});

	test('an empty routine has no steps to point at', () => {
		const day = newPracticeDay({ steps: [], totalMinutes: 0 }, opened);
		expect(nextStepIndex(day)).toBe(0);
	});
});

describe('detachSession', () => {
	test('removes the id from every step that holds it and keeps the rest of the record', () => {
		let day = newPracticeDay(routine, opened);
		day = applyStepUpdate(day, 0, { sessionId: 's1', addSeconds: 40 }, at(21, 1));
		day = applyStepUpdate(day, 0, { sessionId: 's2' }, at(21, 2));
		day = applyStepUpdate(day, 2, { sessionId: 's1' }, at(21, 3));

		const after = detachSession(day, 's1', at(21, 4));
		expect(after.steps.map((s) => s.sessionIds)).toEqual([['s2'], [], []]);
		expect(after.steps[0]).toMatchObject({ status: 'done', seconds: 40 });
		expect(after.steps[2].status).toBe('done');
		expect(after.updatedAt).toEqual(at(21, 4));
		// Never mutates its input.
		expect(day.steps[0].sessionIds).toEqual(['s1', 's2']);
	});

	test('returns the same day when nothing referenced the session', () => {
		const day = applyStepUpdate(newPracticeDay(routine, opened), 0, { sessionId: 's1' }, at(21, 1));
		expect(detachSession(day, 'nope', at(21, 2))).toBe(day);
	});
});
