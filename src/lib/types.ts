export type ExerciseCategory =
	| 'pitch'
	| 'resonance'
	| 'intonation'
	| 'reading'
	| 'warmup'
	// Semi-occluded vocal tract work (straw phonation) — low-effort exercises that
	// build resonance and reduce fold collision. Assigned as therapist homework.
	| 'sovt';
export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface PitchPoint {
	t: number; // time in seconds since recording started
	hz: number;
	confidence: number;
}

export interface PitchData {
	points: PitchPoint[];
	avgPitch: number;
	minPitch: number;
	maxPitch: number;
	timeInTargetPct: number;
}

export interface PitchRange {
	low: number;
	high: number;
}

/** PitchData without the per-frame points. */
export type PitchSummary = Omit<PitchData, 'points'>;

export interface Session {
	_id: string;
	exerciseId: string | null;
	title: string;
	audioKey: string;
	/** MIME type of the stored audio. Older sessions have none and are served as audio/webm. */
	audioType?: string;
	duration: number;
	pitchData: PitchData;
	targetRange: PitchRange;
	notes: string;
	createdAt: Date;
}

/**
 * A Session with the pitch point array left out. Lists and the dashboard show
 * only the summary numbers, and the points can run to 200k entries per session,
 * so list queries project them away rather than serialising them into the page.
 */
export interface SessionSummary extends Omit<Session, 'pitchData'> {
	pitchData: PitchSummary;
}

export interface Exercise {
	_id: string;
	category: ExerciseCategory;
	title: string;
	description: string;
	instructions: string;
	targetRange?: PitchRange;
	estimatedMinutes: number;
	difficulty: Difficulty;
}

/**
 * Which register a range test measured.
 *
 * These are not comparable with each other: a full-range test includes falsetto
 * and typically reads far higher than a modal test of the same voice on the same
 * day. Results are tracked as separate series so a trend never mixes the two.
 */
export type RangeTestMode = 'full' | 'modal';

/**
 * A lowest-to-highest comfortable pitch measurement, taken as a standalone test.
 * Kept separate from Session because it has no audio and measures capability
 * (how wide is your range) rather than performance (where did you sit today).
 */
export interface RangeTest {
	_id: string;
	mode: RangeTestMode;
	lowHz: number;
	highHz: number;
	semitones: number;
	notes: string;
	createdAt: Date;
}

export interface UserSettings {
	_id: string;
	targetRange: PitchRange;
	createdAt: Date;
	updatedAt: Date;
}

export type PracticeStepStatus = 'pending' | 'done' | 'skipped';

/**
 * One step of a day's routine, with what happened to it. The exercise title and
 * category are snapshotted so a day still reads correctly if the library changes
 * later; exerciseId is kept for joining back to the current exercise.
 */
export interface PracticeStep {
	exerciseId: string;
	title: string;
	category: ExerciseCategory;
	purpose: string;
	status: PracticeStepStatus;
	/** Seconds spent on the step, summed across every attempt and recording. */
	seconds: number;
	/** Recordings saved while on this step. */
	sessionIds: string[];
	completedAt: Date | null;
}

/**
 * A day's practice. Keyed by local calendar day so reloading, changing device or
 * leaving for the recorder all come back to the same document. Created the first
 * time the practice page is opened that day, from that day's routine.
 */
export interface PracticeDay {
	/** Local calendar day, e.g. "2026-09-03". */
	_id: string;
	steps: PracticeStep[];
	startedAt: Date;
	updatedAt: Date;
	/** Set once every step is done or skipped; cleared if a step is reopened. */
	completedAt: Date | null;
}

/** The numbers a dashboard card or history row needs, without the steps. */
export interface PracticeDaySummary {
	day: string;
	doneSteps: number;
	totalSteps: number;
	seconds: number;
	complete: boolean;
}
