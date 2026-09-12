import type { PitchRange } from '$lib/types';

/**
 * Equal-temperament note math for the reference-note strip. MIDI numbers are the
 * working unit: A4 = 69 = 440 Hz, one semitone per step.
 */

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

/** Frequency of a MIDI note number (fractional numbers give pitches between notes). */
export function hzFromMidi(midi: number): number {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Fractional MIDI number for a frequency, e.g. 440 -> 69, 226 -> 57.47. */
export function midiFromHz(hz: number): number {
	return 69 + 12 * Math.log2(hz / 440);
}

/** Note name with octave, e.g. 57 -> "A3". Fractional numbers round to the nearest note. */
export function noteName(midi: number): string {
	const rounded = Math.round(midi);
	const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
	const octave = Math.floor(rounded / 12) - 1;
	return `${name}${octave}`;
}

/** True for the black keys (sharps). */
export function isSharp(midi: number): boolean {
	return NOTE_NAMES[((Math.round(midi) % 12) + 12) % 12].endsWith('♯');
}

/**
 * Signed distance from a target pitch in cents (a hundredth of a semitone).
 * Positive is sharp (above the target), negative is flat. 0 when either is silent.
 */
export function centsOff(hz: number, targetHz: number): number {
	if (hz <= 0 || targetHz <= 0) return 0;
	return 1200 * Math.log2(hz / targetHz);
}

/** How far off still counts as matching the note. Tuners commonly use ±10. */
export const ON_PITCH_CENTS = 10;

export interface NoteKey {
	midi: number;
	name: string;
	hz: number;
	/** Whether the note sits inside the target range. */
	inRange: boolean;
	sharp: boolean;
}

/**
 * The notes to show for a target range: every semitone from the lowest note in
 * the range to the highest, plus `pad` semitones on each side so the strip
 * has somewhere to step to when practising the edges.
 */
export function keysForRange(range: PitchRange, pad = 3): NoteKey[] {
	const low = Math.min(range.low, range.high);
	const high = Math.max(range.low, range.high);
	if (!(low > 0) || !(high > 0)) return [];
	const first = Math.ceil(midiFromHz(low)) - pad;
	const last = Math.floor(midiFromHz(high)) + pad;
	const keys: NoteKey[] = [];
	for (let midi = first; midi <= last; midi++) {
		const hz = hzFromMidi(midi);
		keys.push({
			midi,
			name: noteName(midi),
			hz,
			inRange: hz >= low && hz <= high,
			sharp: isSharp(midi)
		});
	}
	return keys;
}
