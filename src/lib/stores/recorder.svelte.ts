import { PitchDetector } from '$lib/audio/pitchDetector';
import { AudioRecorder } from '$lib/audio/recorder';
import { getMicrophoneStream } from '$lib/audio/mic';
import { describeMicError } from '$lib/audio/micErrors';
import type { PitchPoint, PitchData, PitchRange } from '$lib/types';
import { PitchAccumulator } from '$lib/audio/stats';
import { DEFAULT_TARGET_RANGE } from '$lib/audio/utils';

// A little more than the live graph shows (10 s), so the right edge never runs
// out of points while the window pointer catches up.
const LIVE_WINDOW_SECONDS = 12;

class RecorderStore {
	// State
	isRecording = $state(false);
	isPaused = $state(false);
	/** Whole seconds of active recording, for the timer display. */
	duration = $state(0);
	/** Fractional seconds of active recording, so the live graph's right edge tracks the newest point. */
	elapsed = $state(0);
	currentPitch = $state(0);
	targetRange: PitchRange = $state(DEFAULT_TARGET_RANGE);
	error = $state<string | null>(null);

	// Summary numbers, updated incrementally per point. The full history is a
	// plain array: pushing into a deep $state array and re-filtering it in four
	// $derived values made every frame cost O(n).
	avgPitch = $state(0);
	minPitch = $state(0);
	maxPitch = $state(0);
	timeInTargetPct = $state(0);
	/** Voiced points from the last LIVE_WINDOW_SECONDS, replaced (never mutated) each frame. */
	liveWindow = $state.raw<PitchPoint[]>([]);
	pointCount = $state(0);

	// Private
	private history: PitchPoint[] = [];
	private accumulator = new PitchAccumulator(DEFAULT_TARGET_RANGE);
	// Index of the oldest point still inside the live window; only moves forward.
	private windowStart = 0;
	private detector: PitchDetector | null = null;
	private recorder: AudioRecorder | null = null;
	private stream: MediaStream | null = null;
	private timerInterval: ReturnType<typeof setInterval> | null = null;
	private startTime = 0;
	// Wall-clock ms spent paused, so point timestamps and the duration counter
	// line up with the audio (AudioRecorder already excludes pauses from the
	// WebM duration patch; without this the playback graph drifts after any pause).
	private pausedMs = 0;
	private pauseStartedAt = 0;
	// Set while getUserMedia is pending so a second click cannot open a second
	// stream and AudioContext on top of the first.
	private starting = false;

	/** Seconds of active (unpaused) recording so far. */
	private activeSeconds(): number {
		const paused = this.pausedMs + (this.isPaused ? Date.now() - this.pauseStartedAt : 0);
		return (Date.now() - this.startTime - paused) / 1000;
	}

	setTargetRange(range: PitchRange): void {
		this.targetRange = range;
		this.accumulator.setRange(range, this.history);
		this.publishSummary();
	}

	private publishSummary(): void {
		const s = this.accumulator.summary();
		this.avgPitch = s.avgPitch;
		this.minPitch = s.minPitch;
		this.maxPitch = s.maxPitch;
		this.timeInTargetPct = s.timeInTargetPct;
	}

	private addPoint(point: PitchPoint): void {
		this.history.push(point);
		this.accumulator.add(point);
		this.pointCount = this.history.length;
		this.publishSummary();

		const cutoff = point.t - LIVE_WINDOW_SECONDS;
		while (this.windowStart < this.history.length && this.history[this.windowStart].t < cutoff) {
			this.windowStart++;
		}
		this.liveWindow = this.history.slice(this.windowStart);
	}

	async startRecording(deviceId?: string): Promise<void> {
		if (this.isRecording || this.starting) return;
		this.starting = true;
		try {
			// 1. Get mic stream
			this.stream = await getMicrophoneStream(deviceId);

			// 2. Create PitchDetector and AudioRecorder
			this.detector = new PitchDetector(this.stream);
			this.recorder = new AudioRecorder(this.stream);

			// 3. Start pitch detection with callback
			this.detector.onPitch((pitch) => {
				// Skip if paused
				if (this.isPaused) return;

				const t = this.activeSeconds();
				this.elapsed = t;

				// Skip low confidence readings. 0.55 lets legitimate low pitches through:
				// YIN confidence naturally drops at lower Hz even on clean audio because
				// fewer periods fit in the analysis window. The pitchDetector already
				// clamps to 70-500 Hz so out-of-range junk can't leak through.
				if (pitch.confidence < 0.55) {
					this.currentPitch = 0;
					return;
				}

				this.currentPitch = pitch.hz;
				this.addPoint({ t, hz: pitch.hz, confidence: pitch.confidence });
			});
			this.detector.start();

			// 4. Start recording
			this.recorder.start();

			// 5. Start duration timer
			this.startTime = Date.now();
			this.pausedMs = 0;
			this.pauseStartedAt = 0;
			this.timerInterval = setInterval(() => {
				if (!this.isPaused) {
					const seconds = this.activeSeconds();
					this.elapsed = seconds;
					this.duration = Math.floor(seconds);
				}
			}, 100);

			// 6. Set isRecording = true
			this.isRecording = true;
			this.error = null;
		} catch (err) {
			this.error = describeMicError(err);
			this.cleanup();
		} finally {
			this.starting = false;
		}
	}

	async stopRecording(): Promise<{ blob: Blob; pitchData: PitchData }> {
		if (!this.recorder || !this.detector) {
			throw new Error('Not recording');
		}

		// 1. Stop recorder -> get blob
		const blob = await this.recorder.stop();

		// 2. Stop pitch detector
		this.detector.stop();

		// 3. Stop timer
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
			this.timerInterval = null;
		}

		// 4. Hand over the history. reset() replaces the array rather than
		// emptying it, so this reference stays valid after cleanup.
		const pitchData: PitchData = {
			points: this.history,
			...this.accumulator.summary()
		};

		// 5. Set isRecording = false
		this.isRecording = false;

		// 6. Clean up stream tracks
		this.cleanup();

		return { blob, pitchData };
	}

	pauseRecording(): void {
		if (!this.recorder || !this.isRecording || this.isPaused) return;
		this.recorder.pause();
		this.pauseStartedAt = Date.now();
		this.isPaused = true;
	}

	resumeRecording(): void {
		if (!this.recorder || !this.isRecording || !this.isPaused) return;
		this.recorder.resume();
		this.pausedMs += Date.now() - this.pauseStartedAt;
		this.isPaused = false;
	}

	reset(): void {
		this.isRecording = false;
		this.isPaused = false;
		this.duration = 0;
		this.elapsed = 0;
		this.currentPitch = 0;
		this.history = [];
		this.accumulator = new PitchAccumulator(this.targetRange);
		this.windowStart = 0;
		this.liveWindow = [];
		this.pointCount = 0;
		this.publishSummary();
		this.error = null;
		this.cleanup();
	}

	destroy(): void {
		this.reset();
	}

	private cleanup(): void {
		if (this.detector) {
			this.detector.destroy();
			this.detector = null;
		}
		if (this.recorder) {
			this.recorder.destroy();
			this.recorder = null;
		}
		if (this.timerInterval) {
			clearInterval(this.timerInterval);
			this.timerInterval = null;
		}
		if (this.stream) {
			this.stream.getTracks().forEach((track) => track.stop());
			this.stream = null;
		}
	}
}

export const recorderStore = new RecorderStore();
