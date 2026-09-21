import { describe, expect, test } from 'bun:test';
import { summarisePitch, PitchAccumulator } from './stats';
import type { PitchPoint } from '$lib/types';

const p = (hz: number, t = 0): PitchPoint => ({ t, hz, confidence: 1 });
const range = { low: 150, high: 220 };

describe('summarisePitch', () => {
	test('returns zeros for an empty timeline', () => {
		expect(summarisePitch([], range)).toEqual({
			avgPitch: 0,
			medianPitch: 0,
			minPitch: 0,
			maxPitch: 0,
			timeInTargetPct: 0
		});
	});

	test('returns zeros when every frame is unvoiced', () => {
		expect(summarisePitch([p(0), p(0)], range).avgPitch).toBe(0);
	});

	test('ignores unvoiced frames in every statistic', () => {
		const stats = summarisePitch([p(100), p(200), p(0)], range);
		expect(stats.avgPitch).toBe(150);
		expect(stats.minPitch).toBe(100);
		expect(stats.maxPitch).toBe(200);
		// 200 is in range, 100 is not, the silent frame does not count either way.
		expect(stats.timeInTargetPct).toBe(50);
	});

	test('treats the range as inclusive at both ends', () => {
		expect(summarisePitch([p(150), p(220)], range).timeInTargetPct).toBe(100);
		expect(summarisePitch([p(149.9), p(220.1)], range).timeInTargetPct).toBe(0);
	});

	test('the median is not pulled up by brief excursions the way the mean is', () => {
		// 90% of frames at 200 Hz, 10% at 400 Hz: a laugh in a steady take.
		const points = [
			...Array.from({ length: 90 }, (_, i) => p(200, i)),
			...Array.from({ length: 10 }, (_, i) => p(400, 90 + i))
		];
		const stats = summarisePitch(points, range);
		expect(stats.avgPitch).toBe(220);
		expect(stats.medianPitch).toBe(200);
	});

	test('the median is the lower middle value, exact when the bin agrees, within 10 cents otherwise', () => {
		expect(summarisePitch([p(100), p(200)], range).medianPitch).toBe(100);
		expect(summarisePitch([p(100), p(200), p(300)], range).medianPitch).toBe(200);
		// A glide: every frame in its own bin; the median lands within a bin of the true one.
		const glide = Array.from({ length: 101 }, (_, i) => p(150 * Math.pow(2, i / 100), i));
		const median = summarisePitch(glide, range).medianPitch;
		const cents = 1200 * Math.log2(median / (150 * Math.pow(2, 50 / 100)));
		expect(Math.abs(cents)).toBeLessThanOrEqual(10);
	});

	test('handles a long timeline without spreading into Math.min/max', () => {
		const points = Array.from({ length: 300_000 }, (_, i) => p(180 + (i % 40), i / 60));
		const stats = summarisePitch(points, range);
		expect(stats.minPitch).toBe(180);
		expect(stats.maxPitch).toBe(219);
		expect(stats.timeInTargetPct).toBe(100);
	});
});

describe('PitchAccumulator', () => {
	const range = { low: 180, high: 300 };
	const points = [
		{ t: 0, hz: 0, confidence: 0 },
		{ t: 0.1, hz: 150, confidence: 0.9 },
		{ t: 0.2, hz: 200, confidence: 0.9 },
		{ t: 0.3, hz: 320, confidence: 0.9 },
		{ t: 0.4, hz: 250, confidence: 0.9 }
	];

	test('matches summarisePitch after adding the same points one by one', () => {
		const acc = new PitchAccumulator(range);
		for (const p of points) acc.add(p);
		expect(acc.summary()).toEqual(summarisePitch(points, range));
	});

	test('reports zeros before any voiced point', () => {
		const acc = new PitchAccumulator(range);
		acc.add({ t: 0, hz: 0, confidence: 0 });
		expect(acc.summary()).toEqual({
			avgPitch: 0,
			medianPitch: 0,
			minPitch: 0,
			maxPitch: 0,
			timeInTargetPct: 0
		});
	});

	test('setRange recounts time in target over the points so far', () => {
		const acc = new PitchAccumulator(range);
		for (const p of points) acc.add(p);
		expect(acc.summary().timeInTargetPct).toBe(50);
		const wider = { low: 140, high: 340 };
		acc.setRange(wider, points);
		expect(acc.summary().timeInTargetPct).toBe(100);
		expect(acc.summary()).toEqual(summarisePitch(points, wider));
	});
});
