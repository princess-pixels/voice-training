import fixWebmDuration from 'fix-webm-duration';

export class AudioRecorder {
	private stream: MediaStream;
	private mediaRecorder: MediaRecorder | null = null;
	private chunks: Blob[] = [];
	private recording = false;
	private paused = false;
	private startTime = 0;
	private accumulatedMs = 0;

	constructor(stream: MediaStream) {
		this.stream = stream;
	}

	get isRecording(): boolean {
		return this.recording;
	}

	get isPaused(): boolean {
		return this.paused;
	}

	start(): void {
		if (this.recording) return;

		// Try opus codec first, fall back to default
		const mimeTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];

		let selectedMimeType = '';
		for (const mimeType of mimeTypes) {
			if (MediaRecorder.isTypeSupported(mimeType)) {
				selectedMimeType = mimeType;
				break;
			}
		}

		this.mediaRecorder = new MediaRecorder(this.stream, {
			mimeType: selectedMimeType || undefined
		});

		this.chunks = [];

		this.mediaRecorder.ondataavailable = (event) => {
			if (event.data.size > 0) {
				this.chunks.push(event.data);
			}
		};

		this.mediaRecorder.onerror = (event) => {
			console.error('MediaRecorder error:', event);
		};

		// Request data every 1 second for progressive collection
		this.mediaRecorder.start(1000);
		this.recording = true;
		this.paused = false;
		this.startTime = performance.now();
		this.accumulatedMs = 0;
	}

	stop(): Promise<Blob> {
		return new Promise((resolve, reject) => {
			if (!this.mediaRecorder || !this.recording) {
				reject(new Error('Not recording'));
				return;
			}

			this.mediaRecorder.onstop = async () => {
				const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
				const rawBlob = new Blob(this.chunks, { type: mimeType });

				// Total recording duration in ms, accounting for paused time.
				const activeMs = this.paused
					? this.accumulatedMs
					: this.accumulatedMs + (performance.now() - this.startTime);

				this.chunks = [];
				this.recording = false;
				this.paused = false;

				// MediaRecorder WebM lacks duration cues → browsers report
				// Infinity and the scrubber breaks. Patch duration into the
				// EBML header so <audio> can seek properly.
				if (mimeType.includes('webm') && activeMs > 0) {
					try {
						const fixed = await fixWebmDuration(rawBlob, activeMs, { logger: false });
						resolve(fixed);
						return;
					} catch (err) {
						console.warn('fix-webm-duration failed, using raw blob:', err);
					}
				}
				resolve(rawBlob);
			};

			this.mediaRecorder.stop();
		});
	}

	pause(): void {
		if (!this.mediaRecorder || !this.recording || this.paused) return;
		this.mediaRecorder.pause();
		this.paused = true;
		this.accumulatedMs += performance.now() - this.startTime;
	}

	resume(): void {
		if (!this.mediaRecorder || !this.recording || !this.paused) return;
		this.mediaRecorder.resume();
		this.paused = false;
		this.startTime = performance.now();
	}

	destroy(): void {
		if (this.mediaRecorder) {
			if (this.recording) {
				this.mediaRecorder.stop();
			}
			this.mediaRecorder = null;
		}
		this.chunks = [];
		this.recording = false;
		this.paused = false;
	}
}
