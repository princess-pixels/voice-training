import { describe, expect, test } from 'bun:test';
import { dayKeysEndingAt, localDayKey, pickDayLabelIndices } from './days';

const at = (day: number, hour: number) => new Date(2026, 8, day, hour);

describe('localDayKey', () => {
	test('pads month and day', () => {
		expect(localDayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
	});
});

describe('dayKeysEndingAt', () => {
	test('runs oldest first and crosses a month boundary', () => {
		expect(dayKeysEndingAt('2026-09-02', 4)).toEqual([
			'2026-08-30',
			'2026-08-31',
			'2026-09-01',
			'2026-09-02'
		]);
	});
});

describe('pickDayLabelIndices', () => {
	test('labels each day once, at its first entry', () => {
		const dates = [at(3, 9), at(3, 12), at(3, 20), at(5, 10), at(9, 18)];
		expect(pickDayLabelIndices(dates, 5)).toEqual([0, 3, 4]);
	});

	test('keeps first and last day when thinning', () => {
		const dates = Array.from({ length: 9 }, (_, i) => at(1 + i, 10));
		expect(pickDayLabelIndices(dates, 5)).toEqual([0, 2, 4, 6, 8]);
	});

	test('thins the distinct days, not the entries', () => {
		// Ten takes over three days: three labels, whatever the entry count.
		const dates = [1, 1, 1, 1, 2, 2, 2, 3, 3, 3].map((d) => at(d, 10));
		expect(pickDayLabelIndices(dates, 5)).toEqual([0, 4, 7]);
	});

	test('handles the degenerate sizes', () => {
		expect(pickDayLabelIndices([], 5)).toEqual([]);
		expect(pickDayLabelIndices([at(1, 10)], 5)).toEqual([0]);
		expect(pickDayLabelIndices([at(1, 10), at(2, 10), at(3, 10)], 1)).toEqual([0]);
		expect(pickDayLabelIndices([at(1, 10), at(2, 10)], 0)).toEqual([]);
	});
});
