/**
 * Local calendar-day keys. Shared by the server (practice days, streak) and the
 * client (spotting that midnight has passed), so it lives outside $lib/server.
 */

/** Calendar-day key in local time, e.g. "2026-09-03". */
export function localDayKey(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** The `count` day keys ending at `last` (inclusive), oldest first. */
export function dayKeysEndingAt(last: string, count: number): string[] {
	const [y, m, d] = last.split('-').map(Number);
	const keys: string[] = [];
	for (let i = count - 1; i >= 0; i--) {
		keys.push(localDayKey(new Date(y, m - 1, d - i)));
	}
	return keys;
}

/**
 * Indices of `dates` (ordered by time) that get an axis label: the first entry of
 * each distinct local day, thinned evenly to at most `max`. Several entries on
 * one day share a label rather than repeating it.
 */
export function pickDayLabelIndices(dates: Date[], max: number): number[] {
	if (max <= 0) return [];
	const firstOfDay: number[] = [];
	let prev = '';
	dates.forEach((date, i) => {
		const key = localDayKey(date);
		if (key !== prev) {
			firstOfDay.push(i);
			prev = key;
		}
	});
	if (firstOfDay.length <= max) return firstOfDay;
	const picked: number[] = [];
	for (let i = 0; i < max; i++) {
		picked.push(firstOfDay[Math.round((i * (firstOfDay.length - 1)) / (max - 1 || 1))]);
	}
	return picked;
}

/**
 * Consecutive practice days ending today or yesterday (a streak survives until
 * the end of the day after the last session).
 *
 * Each entry is either a session timestamp or a practice day key ("2026-09-03").
 * Days are local calendar days, matching the daily routine in routine.ts. The
 * previous implementation used UTC, so a session at 00:30 local time counted
 * for the day before and could silently break a streak.
 */
export function calculateStreak(practiced: (Date | string)[], now = new Date()): number {
	if (practiced.length === 0) return 0;

	const days = new Set(practiced.map((d) => (typeof d === 'string' ? d : localDayKey(d))));

	const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	// No session yet today is fine; start counting from yesterday in that case.
	if (!days.has(localDayKey(cursor))) {
		cursor.setDate(cursor.getDate() - 1);
	}

	let streak = 0;
	while (days.has(localDayKey(cursor))) {
		streak++;
		cursor.setDate(cursor.getDate() - 1);
	}
	return streak;
}
