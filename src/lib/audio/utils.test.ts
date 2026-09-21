import { describe, expect, test } from 'bun:test';
import {
	DEFAULT_TARGET_RANGE,
	formatDuration,
	formatHz,
	pitchBand,
	pitchBandClass,
	pitchBandColor,
	pitchBandLabel,
	noteFromHz,
	percentile,
	semitonesBetween
} from './utils';

describe('noteFromHz', () => {
	test.each([
		[440, 'A4'],
		[220, 'A3'],
		[261.63, 'C4'],
		[110, 'A2'],
		[196, 'G3'],
		[185, 'F♯3']
	])('%d Hz is %s', (hz, note) => {
		expect(noteFromHz(hz)).toBe(note);
	});

	test('rounds to the nearest note rather than flooring', () => {
		// 226 Hz is closer to A3 (220) than A♯3 (233).
		expect(noteFromHz(226)).toBe('A3');
		expect(noteFromHz(230)).toBe('A♯3');
	});

	test('returns a dash for silence', () => {
		expect(noteFromHz(0)).toBe('—');
		expect(noteFromHz(-5)).toBe('—');
	});
});

describe('semitonesBetween', () => {
	test('an octave is twelve semitones', () => {
		expect(semitonesBetween(110, 220)).toBeCloseTo(12, 6);
	});

	test('a fifth is seven semitones', () => {
		expect(semitonesBetween(200, 200 * 2 ** (7 / 12))).toBeCloseTo(7, 6);
	});

	test('is zero when either bound is missing', () => {
		expect(semitonesBetween(0, 220)).toBe(0);
		expect(semitonesBetween(110, 0)).toBe(0);
	});
});

describe('percentile', () => {
	const values = [100, 300, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110];

	test('the 5th percentile ignores a single octave-error outlier', () => {
		expect(percentile(values, 0.05)).toBe(101);
		expect(percentile(values, 0.95)).toBe(110);
	});

	test('0 and 1 are min and max', () => {
		expect(percentile(values, 0)).toBe(100);
		expect(percentile(values, 1)).toBe(300);
	});

	test('does not mutate its input', () => {
		const input = [3, 1, 2];
		percentile(input, 0.5);
		expect(input).toEqual([3, 1, 2]);
	});

	test('is zero for an empty sample', () => {
		expect(percentile([], 0.5)).toBe(0);
	});
});

describe('formatting', () => {
	test('formatDuration pads seconds', () => {
		expect(formatDuration(0)).toBe('0:00');
		expect(formatDuration(65)).toBe('1:05');
		expect(formatDuration(3599.9)).toBe('59:59');
	});

	test('formatHz rounds and dashes silence', () => {
		expect(formatHz(219.6)).toBe('220 Hz');
		expect(formatHz(0)).toBe('—');
	});

	test('pitch categories have the documented boundaries', () => {
		const range = { low: 150, high: 220 };
		expect(pitchBand(0, range)).toBe('silent');
		expect(pitchBand(149.9, range)).toBe('below');
		expect(pitchBand(150, range)).toBe('in');
		expect(pitchBand(220, range)).toBe('in');
		expect(pitchBand(220.1, range)).toBe('above');
		// The same 160 Hz is in target on the androgynous preset and below it on the feminine one.
		expect(pitchBand(160, DEFAULT_TARGET_RANGE)).toBe('below');
	});

	test('labels say where the voice is relative to the target, nothing else', () => {
		expect(pitchBandLabel('in')).toBe('in target');
		expect(pitchBandLabel('below')).toBe('below target');
		expect(pitchBandLabel('above')).toBe('above target');
		expect(pitchBandLabel('silent')).toBe('silent');
	});
});

describe('pitch category styling', () => {
	test('class and colour agree with the category for every band', () => {
		const range = { low: 150, high: 200 };
		const cases: [number, string, string][] = [
			[0, 'text-surface-400', '#737373'],
			[120, 'text-indigo-400', '#6366f1'],
			[220, 'text-accent-400', '#a855f7'],
			[160, 'text-primary-400', '#ec4899']
		];
		for (const [hz, cls, colour] of cases) {
			expect(pitchBandClass(hz, range)).toBe(cls);
			expect(pitchBandColor(pitchBand(hz, range))).toBe(colour);
		}
	});

	test('the default target range is the feminine preset', () => {
		expect(DEFAULT_TARGET_RANGE).toEqual({ low: 180, high: 300 });
	});
});
