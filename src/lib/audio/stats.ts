import type { PitchData, PitchPoint, PitchRange } from '$lib/types';

export type PitchSummary = Omit<PitchData, 'points'>;

/**
 * Running summary statistics over a pitch timeline, updated one point at a
 * time so the live studio never has to rescan the whole history. Unvoiced
 * points (hz = 0) are ignored; with no voiced points it reports zeros rather
 * than NaN.
 */
export class PitchAccumulator {
	private count = 0;
	private sum = 0;
	private min = Infinity;
	private max = -Infinity;
	private inTarget = 0;
	private range: PitchRange;

	constructor(range: PitchRange) {
		this.range = range;
	}

	add(point: PitchPoint): void {
		if (point.hz <= 0) return;
		this.count++;
		this.sum += point.hz;
		if (point.hz < this.min) this.min = point.hz;
		if (point.hz > this.max) this.max = point.hz;
		if (point.hz >= this.range.low && point.hz <= this.range.high) this.inTarget++;
	}

	/** Change the target range; the in-target count is recomputed over `points`. */
	setRange(range: PitchRange, points: PitchPoint[]): void {
		this.range = range;
		this.inTarget = 0;
		for (const p of points) {
			if (p.hz > 0 && p.hz >= range.low && p.hz <= range.high) this.inTarget++;
		}
	}

	summary(): PitchSummary {
		if (this.count === 0) {
			return { avgPitch: 0, minPitch: 0, maxPitch: 0, timeInTargetPct: 0 };
		}
		return {
			avgPitch: this.sum / this.count,
			minPitch: this.min,
			maxPitch: this.max,
			timeInTargetPct: (this.inTarget / this.count) * 100
		};
	}
}

/**
 * Summary statistics over a complete pitch timeline.
 *
 * Shared by the recorder store (final summary at stop) and the sessions API
 * (which recomputes from the points rather than trusting the client's numbers).
 */
export function summarisePitch(points: PitchPoint[], range: PitchRange): PitchSummary {
	const acc = new PitchAccumulator(range);
	for (const p of points) acc.add(p);
	return acc.summary();
}
