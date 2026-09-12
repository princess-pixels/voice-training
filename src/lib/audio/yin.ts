/**
 * YIN fundamental-frequency estimator (de Cheveigné & Kawahara, 2002).
 *
 * Pure function over a sample buffer so it can be unit-tested with synthetic
 * tones and run inside yin.worker.ts without dragging the Web Audio plumbing
 * along.
 */

export interface PitchResult {
	hz: number;
	confidence: number;
}

export interface YinOptions {
	/** Lowest pitch worth reporting. Lags longer than sampleRate/minHz are skipped. */
	minHz: number;
	/** Highest pitch worth reporting. Lags shorter than sampleRate/maxHz are skipped. */
	maxHz: number;
	/** Absolute threshold on the normalised difference (YIN step 4). Lower is stricter. */
	threshold: number;
}

export const DEFAULT_YIN_OPTIONS: YinOptions = {
	minHz: 70,
	maxHz: 500,
	threshold: 0.2
};

/** Lag search bounds for a sample rate and pitch band, clamped to what the window can hold. */
export function lagBounds(
	sampleRate: number,
	bufferSize: number,
	{ minHz, maxHz }: Pick<YinOptions, 'minHz' | 'maxHz'>
): { tauMin: number; tauMax: number } {
	const halfSize = bufferSize / 2;
	return {
		tauMin: Math.max(2, Math.floor(sampleRate / maxHz)),
		tauMax: Math.min(halfSize - 2, Math.ceil(sampleRate / minHz))
	};
}

/**
 * Estimate the pitch of `buffer`.
 *
 * `scratch` must be at least buffer.length / 2 long and is overwritten; pass
 * the same array every frame to avoid allocating in the hot loop.
 *
 * Only lags that can correspond to a pitch inside [minHz, maxHz] are
 * searched. The difference function is still evaluated for every lag up to
 * tauMax because the normalisation is a running mean over all smaller lags,
 * but lags above tauMax (pitches below minHz) are skipped entirely. At the
 * defaults and 44.1 kHz that is ~630 lags per frame instead of 2048.
 */
export function yin(
	buffer: Float32Array,
	sampleRate: number,
	options: YinOptions = DEFAULT_YIN_OPTIONS,
	scratch: Float32Array = new Float32Array(buffer.length / 2)
): PitchResult {
	const halfSize = buffer.length / 2;
	const { tauMin, tauMax } = lagBounds(sampleRate, buffer.length, options);
	const cmnd = scratch;
	cmnd[0] = 1;

	// Steps 1-3: difference function with cumulative mean normalisation.
	let runningSum = 0;
	for (let tau = 1; tau <= tauMax + 1; tau++) {
		let diff = 0;
		for (let i = 0; i < halfSize; i++) {
			const delta = buffer[i] - buffer[i + tau];
			diff += delta * delta;
		}
		runningSum += diff;
		cmnd[tau] = runningSum === 0 ? 1 : (diff * tau) / runningSum;
	}

	// Step 4: first dip below threshold inside the valid band, then walk to its bottom.
	let tau = 0;
	for (let t = tauMin; t <= tauMax; t++) {
		if (cmnd[t] < options.threshold) {
			tau = t;
			while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
			break;
		}
	}
	if (tau === 0) return { hz: 0, confidence: 0 };

	// A pitch above maxHz has its period below tauMin, outside the search band,
	// but its double period sits inside it and dips just as deeply, so a 600 Hz
	// squeak would be reported as a confident 300 Hz. If the half lag also dips
	// under the threshold, the real pitch is out of range: reject the frame
	// rather than report the subharmonic. (A half lag inside the band would
	// already have been found first by the scan above.)
	const half = Math.round(tau / 2);
	if (half >= 2 && half < tauMin && cmnd[half] < options.threshold) {
		return { hz: 0, confidence: 0 };
	}

	// Step 5: parabolic interpolation around the minimum for sub-sample precision.
	const betterTau = tau > 1 && tau <= tauMax ? interpolate(cmnd, tau) : tau;

	return {
		hz: sampleRate / betterTau,
		confidence: Math.max(0, Math.min(1, 1 - cmnd[tau]))
	};
}

function interpolate(cmnd: Float32Array, tau: number): number {
	const alpha = cmnd[tau - 1];
	const beta = cmnd[tau];
	const gamma = cmnd[tau + 1];
	const denom = alpha - 2 * beta + gamma;
	if (denom === 0) return tau;
	return tau + (0.5 * (alpha - gamma)) / denom;
}
