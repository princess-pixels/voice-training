/**
 * Date and time formatting in the user's own locale. One place, so the
 * dashboard, the session list and detail, the range test and the trend chart
 * agree with each other and with the user's system settings (no hard-wired
 * 'en-US' and 12-hour clocks for everyone).
 *
 * `locale` is only for tests; callers leave it undefined.
 */

export type DateStyle = 'short' | 'long';

const DATE_OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
	short: { year: 'numeric', month: 'short', day: 'numeric' },
	long: { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
};

export function formatDate(
	date: Date | string,
	style: DateStyle = 'short',
	locale?: string
): string {
	return new Date(date).toLocaleDateString(locale, DATE_OPTIONS[style]);
}

export function formatTime(date: Date | string, locale?: string): string {
	return new Date(date).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' });
}

/** Day and month only, for an axis label. */
export function formatDayMonth(date: Date | string, locale?: string): string {
	return new Date(date).toLocaleDateString(locale, { month: 'numeric', day: 'numeric' });
}

function startOfLocalDay(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * "Today", "Yesterday", "3 days ago", then a short date. "Today" is the local
 * calendar day, matching the streak, not the last 24 hours; Math.round absorbs
 * the hour a DST change adds or removes.
 */
export function formatRelativeDay(date: Date | string, now = new Date(), locale?: string): string {
	const d = new Date(date);
	const diffDays = Math.round(
		(startOfLocalDay(now).getTime() - startOfLocalDay(d).getTime()) / (1000 * 60 * 60 * 24)
	);
	if (diffDays === 0) return 'Today';
	if (diffDays === 1) return 'Yesterday';
	if (diffDays > 1 && diffDays < 7) return `${diffDays} days ago`;
	return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}
