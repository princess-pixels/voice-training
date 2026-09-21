import type { PitchData, PitchPoint, PitchRange } from '$lib/types';

export type PitchSummary = Omit<PitchData, 'points'>;

/**
 * Running summary statistics over a pitch timeline, updated one point at a
 * time so the live studio never has to rescan the whole history. Unvoiced
 * points (hz = 0) are ignored; with no voiced points it reports zeros rather
 * than NaN.
 */
// Histogram bins are 10 cents wide, counted from A1 (55 Hz). ~600 bins span
// the detector's 70–500 Hz, so the median is a short walk at summary time and
// O(1) per point while recording.
const BIN_CENTS = 10;
const BIN_REF_HZ = 55;

function binOf(hz: number): number {
	return Math.round((1200 * Math.log2(hz / BIN_REF_HZ)) / BIN_CENTS);
}

export class PitchAccumulator {
	private count = 0;
	private sum = 0;
	private min = Infinity;
	private max = -Infinity;
	private inTarget = 0;
	private range: PitchRange;
	/** Per 10-cent bin: how many frames landed in it and their Hz sum, so the
	 * median bin reports the mean of its own members (exact when they agree). */
	private bins = new Map<number, { n: number; sum: number }>();

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
		const bin = binOf(point.hz);
		const b = this.bins.get(bin);
		if (b) {
			b.n++;
			b.sum += point.hz;
		} else {
			this.bins.set(bin, { n: 1, sum: point.hz });
		}
	}

	/** The lower median: the bin where the running count reaches half the frames. */
	private median(): number {
		const half = this.count / 2;
		let seen = 0;
		for (const bin of [...this.bins.keys()].sort((a, b) => a - b)) {
			const b = this.bins.get(bin)!;
			seen += b.n;
			if (seen >= half) return b.sum / b.n;
		}
		return 0;
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
			return { avgPitch: 0, medianPitch: 0, minPitch: 0, maxPitch: 0, timeInTargetPct: 0 };
		}
		return {
			avgPitch: this.sum / this.count,
			medianPitch: this.median(),
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
