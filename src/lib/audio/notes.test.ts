import { describe, expect, test } from 'bun:test';
import {
	centsOff,
	hzFromMidi,
	isSharp,
	keysForRange,
	midiFromHz,
	noteName,
	ON_PITCH_CENTS
} from './notes';

describe('hzFromMidi / midiFromHz', () => {
	test.each([
		[69, 440],
		[57, 220],
		[60, 261.63],
		[45, 110]
	])('MIDI %d is %d Hz', (midi, hz) => {
		expect(hzFromMidi(midi)).toBeCloseTo(hz, 1);
		expect(midiFromHz(hz)).toBeCloseTo(midi, 2);
	});

	test('round-trips fractional values', () => {
		expect(midiFromHz(hzFromMidi(57.5))).toBeCloseTo(57.5, 6);
	});
});

describe('noteName', () => {
	test.each([
		[69, 'A4'],
		[57, 'A3'],
		[60, 'C4'],
		[59, 'B3'],
		[61, 'C♯4'],
		[0, 'C-1']
	])('%d is %s', (midi, name) => {
		expect(noteName(midi)).toBe(name);
	});

	test('rounds a fractional number to the nearest note', () => {
		expect(noteName(57.4)).toBe('A3');
		expect(noteName(57.6)).toBe('A♯3');
	});
});

describe('isSharp', () => {
	test('black keys are sharps, white keys are not', () => {
		expect(isSharp(61)).toBe(true); // C♯4
		expect(isSharp(60)).toBe(false); // C4
		expect(isSharp(58)).toBe(true); // A♯3
		expect(isSharp(-1)).toBe(false); // B-2
	});
});

describe('centsOff', () => {
	test('is zero on the note', () => {
		expect(centsOff(220, 220)).toBe(0);
	});

	test('is +100 one semitone sharp and -100 one semitone flat', () => {
		expect(centsOff(hzFromMidi(58), 220)).toBeCloseTo(100, 6);
		expect(centsOff(hzFromMidi(56), 220)).toBeCloseTo(-100, 6);
	});

	test('is zero when either side is silent', () => {
		expect(centsOff(0, 220)).toBe(0);
		expect(centsOff(220, 0)).toBe(0);
	});

	test('the on-pitch window is the usual tuner tolerance', () => {
		expect(ON_PITCH_CENTS).toBe(10);
	});
});

describe('keysForRange', () => {
	test('covers the range plus padding on both sides', () => {
		// 180 Hz is between F3 (174.6) and F♯3 (185); 300 Hz between D4 (293.7) and D♯4 (311).
		const keys = keysForRange({ low: 180, high: 300 }, 3);
		expect(keys[0].name).toBe('D♯3'); // F♯3 (54) - 3
		expect(keys[keys.length - 1].name).toBe('F4'); // D4 (62) + 3
		expect(keys.map((k) => k.midi)).toEqual(Array.from({ length: 15 }, (_, i) => 51 + i));
	});

	test('marks only the notes inside the range', () => {
		const keys = keysForRange({ low: 180, high: 300 }, 3);
		const inRange = keys.filter((k) => k.inRange).map((k) => k.name);
		expect(inRange).toEqual(['F♯3', 'G3', 'G♯3', 'A3', 'A♯3', 'B3', 'C4', 'C♯4', 'D4']);
	});

	test('a note exactly on the boundary is in range', () => {
		const keys = keysForRange({ low: 220, high: 440 }, 0);
		expect(keys[0]).toMatchObject({ name: 'A3', inRange: true });
		expect(keys[keys.length - 1]).toMatchObject({ name: 'A4', inRange: true });
	});

	test('tolerates a reversed range and defaults the padding', () => {
		expect(keysForRange({ low: 300, high: 180 })).toEqual(keysForRange({ low: 180, high: 300 }));
	});

	test('is empty for a range with no positive bound', () => {
		expect(keysForRange({ low: 0, high: 200 })).toEqual([]);
		expect(keysForRange({ low: NaN, high: 200 })).toEqual([]);
	});

	test('fills in hz and sharps', () => {
		const a3 = keysForRange({ low: 220, high: 220 }, 1)[1];
		expect(a3.hz).toBeCloseTo(220, 6);
		expect(a3.sharp).toBe(false);
		expect(keysForRange({ low: 220, high: 220 }, 1)[2]).toMatchObject({ name: 'A♯3', sharp: true });
	});
});
