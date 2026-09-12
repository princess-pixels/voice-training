import { describe, expect, test } from 'bun:test';
import { parseRange } from './range';

const SIZE = 1000;

describe('parseRange', () => {
	test('no header means the whole object', () => {
		expect(parseRange(null, SIZE)).toEqual({ kind: 'full' });
		expect(parseRange('', SIZE)).toEqual({ kind: 'full' });
	});

	test('open-ended probe from the audio element', () => {
		expect(parseRange('bytes=0-', SIZE)).toEqual({
			kind: 'partial',
			range: { start: 0, end: 999 }
		});
		expect(parseRange('bytes=500-', SIZE)).toEqual({
			kind: 'partial',
			range: { start: 500, end: 999 }
		});
	});

	test('explicit inclusive range', () => {
		expect(parseRange('bytes=100-199', SIZE)).toEqual({
			kind: 'partial',
			range: { start: 100, end: 199 }
		});
	});

	test('end past the object is clamped, not rejected', () => {
		expect(parseRange('bytes=900-5000', SIZE)).toEqual({
			kind: 'partial',
			range: { start: 900, end: 999 }
		});
	});

	test('suffix form returns the tail', () => {
		expect(parseRange('bytes=-100', SIZE)).toEqual({
			kind: 'partial',
			range: { start: 900, end: 999 }
		});
		expect(parseRange('bytes=-5000', SIZE)).toEqual({
			kind: 'partial',
			range: { start: 0, end: 999 }
		});
	});

	test('start beyond the end is unsatisfiable', () => {
		expect(parseRange('bytes=1000-', SIZE)).toEqual({ kind: 'unsatisfiable' });
		expect(parseRange('bytes=1500-1600', SIZE)).toEqual({ kind: 'unsatisfiable' });
	});

	test('inverted, empty and multi ranges are unsatisfiable', () => {
		expect(parseRange('bytes=200-100', SIZE)).toEqual({ kind: 'unsatisfiable' });
		expect(parseRange('bytes=-', SIZE)).toEqual({ kind: 'unsatisfiable' });
		expect(parseRange('bytes=-0', SIZE)).toEqual({ kind: 'unsatisfiable' });
		expect(parseRange('bytes=0-10,20-30', SIZE)).toEqual({ kind: 'unsatisfiable' });
		expect(parseRange('items=0-10', SIZE)).toEqual({ kind: 'unsatisfiable' });
	});

	test('any range on an empty object is unsatisfiable', () => {
		expect(parseRange('bytes=0-', 0)).toEqual({ kind: 'unsatisfiable' });
	});
});
