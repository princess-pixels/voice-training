import type { PitchRange } from '$lib/types';
import { midiFromHz, noteName } from './notes';

export function formatHz(hz: number): string {
	if (hz === 0) return '—';
	return `${Math.round(hz)} Hz`;
}

export function formatDuration(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Nearest musical note for a frequency, e.g. 220 -> "A3". */
export function noteFromHz(hz: number): string {
	if (hz <= 0) return '—';
	return noteName(midiFromHz(hz));
}

/** Size of a pitch interval in semitones — the standard way to express vocal range. */
export function semitonesBetween(lowHz: number, highHz: number): number {
	if (lowHz <= 0 || highHz <= 0) return 0;
	return 12 * Math.log2(highHz / lowHz);
}

/**
 * Value at a percentile of a numeric sample (0 = min, 1 = max).
 * Used instead of raw min/max so a single octave-error blip can't define a range.
 */
export function percentile(values: number[], p: number): number {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))));
	return sorted[index];
}

export { DEFAULT_TARGET_RANGE } from '$lib/constants';

/**
 * Where a pitch sits relative to the user's own target range. This is the
 * only way the app grades a voice: against what the user asked for, never
 * against a fixed idea of what a feminine or masculine voice is.
 */
export type PitchBand = 'below' | 'in' | 'above' | 'silent';

export function pitchBand(hz: number, range: PitchRange): PitchBand {
	if (hz <= 0) return 'silent';
	if (hz < range.low) return 'below';
	if (hz > range.high) return 'above';
	return 'in';
}

export function pitchBandLabel(band: PitchBand): string {
	switch (band) {
		case 'in':
			return 'in target';
		case 'below':
			return 'below target';
		case 'above':
			return 'above target';
		default:
			return 'silent';
	}
}

/** Tailwind text colour class for a pitch, matching pitchBandColor. */
export function pitchBandClass(hz: number, range: PitchRange): string {
	switch (pitchBand(hz, range)) {
		case 'in':
			return 'text-primary-400';
		case 'above':
			return 'text-accent-400';
		case 'below':
			return 'text-indigo-400';
		default:
			return 'text-surface-400';
	}
}

export function pitchBandColor(band: PitchBand): string {
	switch (band) {
		case 'in':
			return '#ec4899'; // pink-500
		case 'above':
			return '#a855f7'; // purple-500
		case 'below':
			return '#6366f1'; // indigo-500
		default:
			return '#737373'; // neutral-500
	}
}
