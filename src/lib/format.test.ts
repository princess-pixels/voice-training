import { describe, expect, test } from 'bun:test';
import { formatDate, formatDayMonth, formatRelativeDay, formatTime } from './format';

const when = new Date(2026, 8, 3, 14, 5); // 3 Sept 2026, 14:05 local

describe('format', () => {
	test('dates follow the locale asked for', () => {
		expect(formatDate(when, 'short', 'en-US')).toBe('Sep 3, 2026');
		expect(formatDate(when, 'short', 'en-GB')).toBe('3 Sept 2026');
		expect(formatDate(when, 'long', 'en-US')).toBe('Thursday, September 3, 2026');
		expect(formatDate(when.toISOString(), 'short', 'en-US')).toBe('Sep 3, 2026');
	});

	test('times follow the locale clock', () => {
		expect(formatTime(when, 'en-US')).toBe('2:05 PM');
		expect(formatTime(when, 'en-GB')).toBe('14:05');
	});

	test('axis labels are day and month in locale order', () => {
		expect(formatDayMonth(when, 'en-US')).toBe('9/3');
		expect(formatDayMonth(when, 'en-GB')).toBe('03/09');
	});

	test('relative days count local calendar days', () => {
		const now = new Date(2026, 8, 10, 1, 0);
		expect(formatRelativeDay(new Date(2026, 8, 10, 0, 30), now)).toBe('Today');
		expect(formatRelativeDay(new Date(2026, 8, 9, 23, 59), now)).toBe('Yesterday');
		expect(formatRelativeDay(new Date(2026, 8, 7, 12), now)).toBe('3 days ago');
		expect(formatRelativeDay(new Date(2026, 8, 1, 12), now, 'en-US')).toBe('Sep 1');
		// A date in the future is not "-2 days ago".
		expect(formatRelativeDay(new Date(2026, 8, 12, 12), now, 'en-US')).toBe('Sep 12');
	});
});
