import { yin, DEFAULT_YIN_OPTIONS, type PitchResult, type YinOptions } from './yin';
import type { YinRequest } from './yin.worker';

export type { PitchResult } from './yin';

export interface PitchDetectorOptions {
	sampleRate?: number;
	bufferSize?: number;
	minHz?: number;
	maxHz?: number;
	amplitudeThreshold?: number;
	/** Milliseconds between analysis frames. */
	hopMs?: number;
}

/**
 * Live pitch tracking from a MediaStream: Web Audio plumbing around the pure
 * YIN estimator in ./yin.ts.
 *
 * Frames are taken on a fixed timer rather than requestAnimationFrame, so the
 * point rate does not depend on the display's refresh rate and detection keeps
 * going in a background tab. The estimate itself runs in a Worker; the main
 * thread only copies 16 KB out of the analyser per hop. If the Worker cannot be
 * created the estimator runs inline, which is what it used to do everywhere.
 */
export class PitchDetector {
	private stream: MediaStream;
	private audioContext: AudioContext | null = null;
	private analyser: AnalyserNode | null = null;
	private source: MediaStreamAudioSourceNode | null = null;
	private worker: Worker | null = null;
	private timer: ReturnType<typeof setInterval> | null = null;
	// Set between posting a frame to the worker and getting its result back. A
	// slow device drops hops instead of queueing them, so latency stays bounded.
	private inFlight = false;
	// Only used by the inline fallback.
	private scratch: Float32Array<ArrayBuffer> | null = null;
	private bufferSize: number;
	private sampleRate: number;
	private running = false;
	private pitchCallback: ((pitch: PitchResult) => void) | null = null;

	private readonly hopMs: number;
	private readonly yinOptions: YinOptions;

	// Amplitude gate: skip YIN entirely if the frame is too quiet (silence/breath).
	private readonly amplitudeThreshold: number;

	constructor(stream: MediaStream, options: PitchDetectorOptions = {}) {
		this.stream = stream;
		// 4096 buffer: ~93ms of audio at 44.1kHz. Fits enough waveform periods
		// for reliable YIN detection down to ~70 Hz. Smaller buffers (2048)
		// make low pitches unreliable because too few periods fit in the window.
		this.bufferSize = options.bufferSize ?? 4096;
		this.sampleRate = options.sampleRate ?? 44100;
		this.yinOptions = {
			minHz: options.minHz ?? DEFAULT_YIN_OPTIONS.minHz,
			maxHz: options.maxHz ?? DEFAULT_YIN_OPTIONS.maxHz,
			threshold: DEFAULT_YIN_OPTIONS.threshold
		};
		this.amplitudeThreshold = options.amplitudeThreshold ?? 0.003;
		// 40 frames a second: the window is ~90 ms, so consecutive frames still
		// overlap by more than two thirds.
		this.hopMs = options.hopMs ?? 25;
	}

	onPitch(callback: (pitch: PitchResult) => void): void {
		this.pitchCallback = callback;
	}

	start(): void {
		if (this.running) return;

		this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
		// Some browsers create the context suspended until a user gesture has
		// happened; without this it would silently produce zeros.
		void this.audioContext.resume();
		// Browsers may ignore the requested rate (Firefox and Safari often keep the
		// device rate). Hz = sampleRate / lag, so trusting the requested value
		// instead of the real one would scale every reading by the ratio.
		this.sampleRate = this.audioContext.sampleRate;
		this.analyser = this.audioContext.createAnalyser();
		this.analyser.fftSize = this.bufferSize;
		this.analyser.smoothingTimeConstant = 0;

		this.source = this.audioContext.createMediaStreamSource(this.stream);
		this.source.connect(this.analyser);

		this.worker = this.createWorker();
		this.running = true;
		this.timer = setInterval(() => this.tick(), this.hopMs);
	}

	stop(): void {
		this.running = false;
		if (this.timer !== null) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.inFlight = false;
	}

	destroy(): void {
		this.stop();
		if (this.worker) {
			this.worker.terminate();
			this.worker = null;
		}
		if (this.source) {
			this.source.disconnect();
			this.source = null;
		}
		this.analyser = null;
		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = null;
		}
	}

	private createWorker(): Worker | null {
		if (typeof Worker === 'undefined') return null;
		try {
			const worker = new Worker(new URL('./yin.worker.ts', import.meta.url), { type: 'module' });
			worker.onmessage = (event: MessageEvent<PitchResult>) => {
				this.inFlight = false;
				if (this.running) this.emit(event.data);
			};
			worker.onerror = (event) => {
				// Most likely the module failed to load; fall back to inline YIN
				// for the rest of this session rather than going silent.
				console.warn('[pitch] worker failed, running YIN on the main thread', event.message);
				worker.terminate();
				this.worker = null;
				this.inFlight = false;
			};
			return worker;
		} catch (err) {
			console.warn('[pitch] could not create worker, running YIN on the main thread', err);
			return null;
		}
	}

	private tick(): void {
		if (!this.analyser || !this.running) return;
		if (this.inFlight) return;

		// Fresh buffer each hop because it is transferred to the worker; 16 KB at
		// 40 Hz is nothing to the allocator, and it saves a ping-pong protocol.
		const buffer = new Float32Array(this.bufferSize);
		this.analyser.getFloatTimeDomainData(buffer);

		let sumSquares = 0;
		for (let i = 0; i < this.bufferSize; i++) {
			sumSquares += buffer[i] * buffer[i];
		}
		const rms = Math.sqrt(sumSquares / this.bufferSize);
		if (rms < this.amplitudeThreshold) {
			this.pitchCallback?.({ hz: 0, confidence: 0 });
			return;
		}

		if (this.worker) {
			this.inFlight = true;
			const request: YinRequest = { buffer, sampleRate: this.sampleRate, options: this.yinOptions };
			this.worker.postMessage(request, [buffer.buffer]);
			return;
		}

		this.scratch ??= new Float32Array(this.bufferSize / 2);
		this.emit(yin(buffer, this.sampleRate, this.yinOptions, this.scratch));
	}

	private emit(pitch: PitchResult): void {
		// yin() only searches the valid band, but interpolation can nudge a result
		// just past an edge; keep the clamp so callers can trust the range.
		if (pitch.hz < this.yinOptions.minHz || pitch.hz > this.yinOptions.maxHz) {
			this.pitchCallback?.({ hz: 0, confidence: 0 });
			return;
		}
		this.pitchCallback?.(pitch);
	}
}
