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

/** A breathy or high-passed voice: the fundamental 10 dB below the second harmonic. */
function weakFundamental(hz: number, sampleRate: number): Float32Array {
	const buffer = new Float32Array(BUFFER_SIZE);
	for (let i = 0; i < buffer.length; i++) {
		const phase = (2 * Math.PI * hz * i) / sampleRate;
		buffer[i] = 0.1 * Math.sin(phase) + 0.3 * Math.sin(2 * phase) + 0.1 * Math.sin(3 * phase);
	}
	return buffer;
}

/** Distance from `hz` to `reference` in cents. */
function cents(hz: number, reference: number): number {
	return 1200 * Math.log2(hz / reference);
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
	])('at %d Hz sample rate detects a %d Hz tone within a cent', (sampleRate, hz) => {
		const result = yin(tone(hz, sampleRate), sampleRate);
		expect(result.confidence).toBeGreaterThan(0.9);
		expect(Math.abs(cents(result.hz, hz))).toBeLessThan(1);
	});

	test('a tone under −20 dB of noise reads within 5 cents', () => {
		const clean = tone(220, 48000);
		const n = noise();
		const buffer = new Float32Array(BUFFER_SIZE);
		for (let i = 0; i < BUFFER_SIZE; i++) buffer[i] = clean[i] + 0.1 * n[i];
		const result = yin(buffer, 48000);
		expect(Math.abs(cents(result.hz, 220))).toBeLessThan(5);
	});

	test('vibrato of ±50 cents reads inside the vibrato, near its centre', () => {
		// 6 Hz vibrato: a frame of 85 ms sees half a cycle, so the estimate
		// lands somewhere inside the excursion, never outside it.
		const sampleRate = 48000;
		const buffer = new Float32Array(BUFFER_SIZE);
		let phase = 0;
		for (let i = 0; i < BUFFER_SIZE; i++) {
			const hz = 220 * Math.pow(2, (50 / 1200) * Math.sin((2 * Math.PI * 6 * i) / sampleRate));
			phase += (2 * Math.PI * hz) / sampleRate;
			buffer[i] = 0.3 * Math.sin(phase) + 0.1 * Math.sin(2 * phase);
		}
		const result = yin(buffer, sampleRate);
		expect(Math.abs(cents(result.hz, 220))).toBeLessThanOrEqual(50);
		expect(result.confidence).toBeGreaterThan(0.8);
	});

	test('any reported pitch carries confidence above 1 − threshold', () => {
		// So a consumer gating on a lower value is gating on nothing (C03).
		for (const hz of [80, 120, 220, 330, 480]) {
			const result = yin(tone(hz, 48000), 48000);
			expect(result.hz).toBeGreaterThan(0);
			expect(result.confidence).toBeGreaterThan(1 - DEFAULT_YIN_OPTIONS.threshold);
		}
	});

	test('uses the real sample rate, so the same buffer reads differently at 48k vs 44.1k', () => {
		const buffer = tone(200, 48000);
		const at48 = yin(buffer, 48000).hz;
		const at44 = yin(buffer, 44100).hz;
		expect(at48).toBeCloseTo(200, 0);
		expect(at44).toBeCloseTo(200 * (44100 / 48000), 0);
	});

	test.each([
		[48000, 200],
		[48000, 250],
		[44100, 160]
	])('at %d Hz sample rate reads a weak %d Hz fundamental at its true octave', (sampleRate, hz) => {
		// Without the octave check the first dip is at half the period: 250 Hz
		// read as 503 Hz (then rejected as out of band) and 200 Hz as 401 Hz.
		const result = yin(weakFundamental(hz, sampleRate), sampleRate);
		expect(Math.abs(result.hz - hz) / hz).toBeLessThan(0.005);
		expect(result.confidence).toBeGreaterThan(0.9);
	});

	test('analyses the newest part of the frame, not the oldest', () => {
		// The oldest third of the buffer is 200 Hz, the rest 300 Hz: what the
		// analyser holds a beat after the voice moved. Reading from index 0
		// mixed the two; reading the tail gives the current pitch.
		const sampleRate = 48000;
		const old = tone(200, sampleRate);
		const now = tone(300, sampleRate);
		const buffer = new Float32Array(BUFFER_SIZE);
		const split = 1360;
		for (let i = 0; i < BUFFER_SIZE; i++) buffer[i] = i < split ? old[i] : now[i];
		const result = yin(buffer, sampleRate);
		expect(Math.abs(result.hz - 300) / 300).toBeLessThan(0.005);
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

	test('returns no pitch at all for white noise', () => {
		expect(yin(noise(), 44100)).toEqual({ hz: 0, confidence: 0 });
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
