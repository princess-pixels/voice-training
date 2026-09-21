import type { PracticeDay, PracticeDaySummary, PracticeStep, PracticeStepStatus } from '$lib/types';
import { DAY_KEY, localDayKey } from '$lib/days';
import type { DailyRoutine } from './routine';

/**
 * Pure practice-day logic: creating a day from a routine, applying step updates,
 * summarising. Storage lives in db.ts; this module is what bun test covers.
 */

export const STEP_STATUSES: PracticeStepStatus[] = ['pending', 'done', 'skipped'];

export { DAY_KEY, localDayKey };

/** A fresh, untouched day built from a routine. */
export function newPracticeDay(routine: DailyRoutine, now = new Date()): PracticeDay {
	return {
		_id: localDayKey(now),
		steps: routine.steps.map((step) => ({
			exerciseId: step.exercise._id,
			title: step.exercise.title,
			category: step.exercise.category,
			purpose: step.purpose,
			status: 'pending',
			seconds: 0,
			sessionIds: [],
			completedAt: null
		})),
		startedAt: now,
		updatedAt: now,
		completedAt: null
	};
}

export interface StepUpdate {
	/** New status. Attaching a session without one marks the step done. */
	status?: PracticeStepStatus;
	/** Seconds to add to the step's total. */
	addSeconds?: number;
	/** A recording saved on this step. Ignored if already attached. */
	sessionId?: string;
}

/**
 * Apply an update to one step and return the new day. Never mutates its input.
 * Throws on an out-of-range index; callers turn that into a 400.
 */
export function applyStepUpdate(
	day: PracticeDay,
	index: number,
	update: StepUpdate,
	now = new Date()
): PracticeDay {
	if (!Number.isInteger(index) || index < 0 || index >= day.steps.length) {
		throw new RangeError(`No step at index ${index}`);
	}

	const prev = day.steps[index];
	const status = update.status ?? (update.sessionId ? 'done' : prev.status);
	const sessionIds =
		update.sessionId && !prev.sessionIds.includes(update.sessionId)
			? [...prev.sessionIds, update.sessionId]
			: prev.sessionIds;

	const step: PracticeStep = {
		...prev,
		status,
		seconds: prev.seconds + Math.max(0, update.addSeconds ?? 0),
		sessionIds,
		// Keep the first completion time on a done step; clear it when reopened.
		completedAt: status === 'done' ? (prev.status === 'done' ? prev.completedAt : now) : null
	};

	const steps = day.steps.map((s, i) => (i === index ? step : s));
	const resolved = steps.every((s) => s.status !== 'pending');

	return {
		...day,
		steps,
		updatedAt: now,
		completedAt: resolved ? (day.completedAt ?? now) : null
	};
}

/**
 * Forget a recording that no longer exists. Returns the same object when the
 * day never referenced it, so callers can skip the write. The step's status
 * and time are the user's record and stay as they are.
 */
export function detachSession(day: PracticeDay, sessionId: string, now = new Date()): PracticeDay {
	if (!day.steps.some((s) => s.sessionIds.includes(sessionId))) return day;
	return {
		...day,
		steps: day.steps.map((s) =>
			s.sessionIds.includes(sessionId)
				? { ...s, sessionIds: s.sessionIds.filter((id) => id !== sessionId) }
				: s
		),
		updatedAt: now
	};
}

/** Put every step back to pending. Time spent and recordings are kept. */
export function resetPracticeDay(day: PracticeDay, now = new Date()): PracticeDay {
	return {
		...day,
		steps: day.steps.map((s) => ({ ...s, status: 'pending', completedAt: null })),
		updatedAt: now,
		completedAt: null
	};
}

export function summarisePracticeDay(day: PracticeDay): PracticeDaySummary {
	return {
		day: day._id,
		doneSteps: day.steps.filter((s) => s.status === 'done').length,
		totalSteps: day.steps.length,
		seconds: day.steps.reduce((sum, s) => sum + s.seconds, 0),
		complete: day.completedAt !== null
	};
}

/** True if at least one step was actually done, i.e. the day counts as practice. */
export function isPracticed(day: Pick<PracticeDay, 'steps'>): boolean {
	return day.steps.some((s) => s.status === 'done');
}

/** Index of the step to show on open: the first pending one, or the last if none. */
export function nextStepIndex(day: Pick<PracticeDay, 'steps'>): number {
	const i = day.steps.findIndex((s) => s.status === 'pending');
	return i === -1 ? Math.max(0, day.steps.length - 1) : i;
}
