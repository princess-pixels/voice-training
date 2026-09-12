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

/** The feminine preset; what every range falls back to when nothing is configured. */
export const DEFAULT_TARGET_RANGE: PitchRange = { low: 180, high: 300 };

export function getPitchCategory(hz: number): 'feminine' | 'androgynous' | 'masculine' | 'silent' {
	if (hz === 0) return 'silent';
	if (hz >= 180) return 'feminine';
	if (hz >= 150) return 'androgynous';
	return 'masculine';
}

/** Tailwind text colour class for a pitch, matching getPitchCategoryColor. */
export function getPitchCategoryClass(hz: number): string {
	switch (getPitchCategory(hz)) {
		case 'feminine':
			return 'text-primary-400';
		case 'androgynous':
			return 'text-accent-400';
		case 'masculine':
			return 'text-indigo-400';
		default:
			return 'text-surface-400';
	}
}

export function getPitchCategoryColor(category: string): string {
	switch (category) {
		case 'feminine':
			return '#ec4899'; // pink-500
		case 'androgynous':
			return '#a855f7'; // purple-500
		case 'masculine':
			return '#6366f1'; // indigo-500
		default:
			return '#737373'; // neutral-500
	}
}
