import { describe, expect, test } from 'bun:test';
import { calculateStreak } from './db';

// Local-time constructor. The streak must count calendar days in the server's
// zone, so the test builds dates the same way regardless of what TZ is set to.
const at = (day: number, hour: number, minute = 0) => new Date(2026, 8, day, hour, minute);
const now = at(3, 9); // Wednesday Sept 3, 09:00

describe('calculateStreak', () => {
	test('is zero with no sessions', () => {
		expect(calculateStreak([], now)).toBe(0);
	});

	test('counts consecutive days ending today', () => {
		expect(calculateStreak([at(3, 8), at(2, 12), at(1, 12)], now)).toBe(3);
	});

	test('a streak survives until the end of the day after the last session', () => {
		expect(calculateStreak([at(2, 12), at(1, 12)], now)).toBe(2);
	});

	test('breaks on a missed day', () => {
		expect(calculateStreak([at(3, 8), at(1, 12)], now)).toBe(1);
		expect(calculateStreak([at(1, 12)], now)).toBe(0);
	});

	test('several sessions on one day count once', () => {
		expect(calculateStreak([at(3, 8), at(3, 20), at(2, 12)], now)).toBe(2);
	});

	test('a session just after local midnight belongs to that day, not the one before', () => {
		// Under the old UTC logic a 00:30 CEST session was 22:30 UTC the previous
		// day, so this pattern read as a gap. Locally it is a clean run of three.
		expect(calculateStreak([at(3, 0, 30), at(2, 0, 30), at(1, 23, 50)], now)).toBe(3);
	});

	test('a session late in the evening still counts for that day', () => {
		expect(calculateStreak([at(2, 23, 59)], now)).toBe(1);
	});

	test('practice day keys count alongside sessions', () => {
		// A routine done on the 2nd without recording bridges the gap.
		expect(calculateStreak([at(3, 8), '2026-09-02', at(1, 12)], now)).toBe(3);
		expect(calculateStreak(['2026-09-03', '2026-09-02'], now)).toBe(2);
		// The same day from both sources still counts once.
		expect(calculateStreak([at(3, 8), '2026-09-03'], now)).toBe(1);
	});
});
