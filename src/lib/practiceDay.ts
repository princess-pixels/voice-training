import type { JsonDate, PracticeDay } from './types';

/**
 * The parts of practice-day logic the page needs as well as the server: which
 * step to open on, whether a day counts as practice, and reviving a day that
 * came over the wire with its dates as strings. Server-only logic stays in
 * $lib/server/practice.ts, which re-exports these.
 */

/** True if at least one step was actually done, i.e. the day counts as practice. */
export function isPracticed(day: Pick<PracticeDay, 'steps'>): boolean {
	return day.steps.some((s) => s.status === 'done');
}

/** Index of the step to show on open: the first pending one, or the last if none. */
export function nextStepIndex(day: Pick<PracticeDay, 'steps'>): number {
	const i = day.steps.findIndex((s) => s.status === 'pending');
	return i === -1 ? Math.max(0, day.steps.length - 1) : i;
}

/** A practice day as JSON.parse left it, with its Date fields back. */
export function revivePracticeDay(raw: JsonDate<PracticeDay>): PracticeDay {
	return {
		...raw,
		startedAt: new Date(raw.startedAt),
		updatedAt: new Date(raw.updatedAt),
		completedAt: raw.completedAt ? new Date(raw.completedAt) : null,
		steps: raw.steps.map((s) => ({
			...s,
			completedAt: s.completedAt ? new Date(s.completedAt) : null
		}))
	};
}
