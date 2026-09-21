import type { ExerciseCategory, PitchRange } from './types';

/**
 * Dependency-free constants shared by the server and the client, so the
 * storage module never has to import from a presentation module to get them.
 */

/** The feminine preset; what every range falls back to when nothing is configured. */
export const DEFAULT_TARGET_RANGE: PitchRange = { low: 180, high: 300 };

/** The order a routine, the library and every breakdown list categories in. */
export const CATEGORY_ORDER: ExerciseCategory[] = [
	'warmup',
	'sovt',
	'pitch',
	'resonance',
	'intonation',
	'reading'
];
