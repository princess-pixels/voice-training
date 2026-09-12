import { describe, expect, test } from 'bun:test';
import { PitchSmoother } from './smoothing';

describe('PitchSmoother', () => {
	test('is empty until a voiced frame arrives', () => {
		const s = new PitchSmoother(300);
		expect(s.read(0)).toBeNull();
		s.push(0, 0);
		s.push(NaN, 0);
		expect(s.read(0)).toBeNull();
	});

	test('reports the median of the frames in the window', () => {
		const s = new PitchSmoother(300);
		s.push(220, 0);
		s.push(226, 25);
		s.push(600, 50); // one octave-error blip
		s.push(222, 75);
		s.push(224, 100);
		expect(s.read(100)).toBe(224);
	});

	test('averages the middle pair for an even count', () => {
		const s = new PitchSmoother(300);
		s.push(220, 0);
		s.push(230, 25);
		expect(s.read(25)).toBe(225);
	});

	test('forgets frames older than the window', () => {
		const s = new PitchSmoother(300);
		s.push(200, 0);
		s.push(300, 250);
		expect(s.read(250)).toBe(250);
		expect(s.read(310)).toBe(300);
		expect(s.read(600)).toBeNull();
	});

	test('clear drops everything', () => {
		const s = new PitchSmoother();
		s.push(220, 0);
		s.clear();
		expect(s.read(0)).toBeNull();
	});
});
