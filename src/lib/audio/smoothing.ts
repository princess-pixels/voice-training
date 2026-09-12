/**
 * A short rolling median over recent pitch frames, for readouts that would
 * otherwise flicker on every 25 ms hop. A held note has a natural shimmer of
 * a few Hz; the median of the last third of a second reports where the voice
 * is sitting and shrugs off a single stray frame.
 */
export class PitchSmoother {
	private samples: { t: number; hz: number }[] = [];

	constructor(private readonly windowMs = 350) {}

	/** Record a voiced frame. Silent or invalid frames are ignored. */
	push(hz: number, nowMs: number): void {
		if (!(hz > 0)) return;
		this.samples.push({ t: nowMs, hz });
		this.evict(nowMs);
	}

	/** Median of the frames still inside the window, or null when there are none. */
	read(nowMs: number): number | null {
		this.evict(nowMs);
		const n = this.samples.length;
		if (n === 0) return null;
		const sorted = this.samples.map((s) => s.hz).sort((a, b) => a - b);
		return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
	}

	clear(): void {
		this.samples = [];
	}

	private evict(nowMs: number): void {
		const cutoff = nowMs - this.windowMs;
		let drop = 0;
		while (drop < this.samples.length && this.samples[drop].t < cutoff) drop++;
		if (drop > 0) this.samples.splice(0, drop);
	}
}
