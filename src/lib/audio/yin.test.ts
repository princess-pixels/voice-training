import { describe, expect, test } from 'bun:test';
import { DEFAULT_YIN_OPTIONS, lagBounds, yin } from './yin';

const BUFFER_SIZE = 4096;

/** A voiced-sounding tone: fundamental plus a quieter second harmonic. */
function tone(hz: number, sampleRate: number, amplitude = 0.3): Float32Array {
	const buffer = new Float32Array(BUFFER_SIZE);
	for (let i = 0; i < buffer.length; i++) {
		const phase = (2 * Math.PI * hz * i) / sampleRate;
		buffer[i] = amplitude * Math.sin(phase) + (amplitude / 3) * Math.sin(2 * phase);
	}
	return buffer;
}

/** Deterministic pseudo-random noise so the test never flakes. */
function noise(): Float32Array {
	const buffer = new Float32Array(BUFFER_SIZE);
	let seed = 12345;
	for (let i = 0; i < buffer.length; i++) {
		seed = (seed * 1103515245 + 12345) & 0x7fffffff;
		buffer[i] = (seed / 0x7fffffff) * 0.6 - 0.3;
	}
	return buffer;
}

describe('yin', () => {
	test.each([
		[44100, 100],
		[44100, 220],
		[48000, 220],
		[48000, 440],
		[44100, 75],
		[48000, 480]
	])('at %d Hz sample rate detects a %d Hz tone within 0.5%', (sampleRate, hz) => {
		const result = yin(tone(hz, sampleRate), sampleRate);
		expect(result.confidence).toBeGreaterThan(0.9);
		expect(Math.abs(result.hz - hz) / hz).toBeLessThan(0.005);
	});

	test('uses the real sample rate, so the same buffer reads differently at 48k vs 44.1k', () => {
		const buffer = tone(200, 48000);
		const at48 = yin(buffer, 48000).hz;
		const at44 = yin(buffer, 44100).hz;
		expect(at48).toBeCloseTo(200, 0);
		expect(at44).toBeCloseTo(200 * (44100 / 48000), 0);
	});

	test('rejects a tone above maxHz instead of reporting its subharmonic', () => {
		// 600 Hz at 48 kHz has a period of 80 samples, under the 96-sample band
		// edge; without the half-lag check this read as a confident 300 Hz.
		const result = yin(tone(600, 48000), 48000);
		expect(result.hz).toBe(0);
		expect(result.confidence).toBe(0);
	});

	test('does not report a pitch below minHz even if the buffer contains one', () => {
		const result = yin(tone(50, 44100), 44100);
		expect(result.hz).toBe(0);
		expect(result.confidence).toBe(0);
	});

	test('does not report a pitch above maxHz', () => {
		const result = yin(tone(900, 44100), 44100);
		// Either silence or an octave-below alias; never the out-of-band value itself.
		expect(result.hz).toBeLessThanOrEqual(DEFAULT_YIN_OPTIONS.maxHz);
	});

	test('returns no pitch for silence', () => {
		expect(yin(new Float32Array(BUFFER_SIZE), 44100)).toEqual({ hz: 0, confidence: 0 });
	});

	test('returns no confident pitch for white noise', () => {
		const result = yin(noise(), 44100);
		expect(result.confidence).toBeLessThan(0.9);
	});

	test('accepts a caller-provided scratch buffer and leaves the input untouched', () => {
		const buffer = tone(220, 44100);
		const before = Float32Array.from(buffer);
		const scratch = new Float32Array(BUFFER_SIZE / 2);
		const result = yin(buffer, 44100, DEFAULT_YIN_OPTIONS, scratch);
		expect(result.hz).toBeCloseTo(220, 0);
		expect(buffer).toEqual(before);
		expect(scratch[0]).toBe(1);
	});
});

describe('lagBounds', () => {
	test('maps the pitch band to lags and clamps to the window', () => {
		expect(lagBounds(44100, 4096, { minHz: 70, maxHz: 500 })).toEqual({ tauMin: 88, tauMax: 630 });
		expect(lagBounds(48000, 4096, { minHz: 70, maxHz: 500 })).toEqual({ tauMin: 96, tauMax: 686 });
		// A tiny window cannot hold a 70 Hz period; tauMax is clamped, not wrapped.
		expect(lagBounds(44100, 256, { minHz: 70, maxHz: 500 }).tauMax).toBe(126);
	});
});
