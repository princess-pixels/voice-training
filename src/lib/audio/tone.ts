/**
 * Plays a reference tone through Web Audio. One oscillator at a time: starting
 * a note releases the previous one, and the gain envelope keeps both edges
 * click-free.
 *
 * The waveform is a triangle rather than a sine. A pure sine at 150 to 220 Hz
 * is nearly inaudible on laptop speakers, which roll off below about 200 Hz;
 * the odd harmonics of a triangle carry the pitch without sounding harsh.
 */

/** The subset of AudioContext this player uses, so tests can pass a fake. */
export interface ToneContext {
	readonly currentTime: number;
	readonly state: AudioContextState;
	resume(): Promise<void>;
	close(): Promise<void>;
	createOscillator(): OscillatorNode;
	createGain(): GainNode;
	readonly destination: AudioDestinationNode;
}

export interface TonePlayerOptions {
	/** How to make the context. Defaults to the page's AudioContext. */
	createContext?: () => ToneContext;
	/** Peak gain. Quiet by default: the tone sits under the user's own voice. */
	gain?: number;
	attackMs?: number;
	releaseMs?: number;
	/** Called whenever the tone starts or stops. */
	onChange?: (playing: boolean) => void;
}

interface Voice {
	osc: OscillatorNode;
	env: GainNode;
}

export class TonePlayer {
	private context: ToneContext | null = null;
	private voice: Voice | null = null;
	private stopTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly createContext: () => ToneContext;
	private readonly gain: number;
	private readonly attack: number;
	private readonly release: number;
	private readonly onChange?: (playing: boolean) => void;
	private _playing = false;

	constructor(options: TonePlayerOptions = {}) {
		this.createContext = options.createContext ?? (() => new AudioContext());
		this.gain = options.gain ?? 0.25;
		this.attack = (options.attackMs ?? 15) / 1000;
		this.release = (options.releaseMs ?? 80) / 1000;
		this.onChange = options.onChange;
	}

	get playing(): boolean {
		return this._playing;
	}

	/**
	 * Start a tone at `hz`. With a duration it stops by itself after that many
	 * milliseconds; without one it sustains until `stop()`.
	 */
	async play(hz: number, durationMs: number | null = 2000): Promise<void> {
		if (!(hz > 0)) return;
		this.stop();
		const ctx = (this.context ??= this.createContext());
		// Browsers create the context suspended until a user gesture; play() is
		// always called from one, so resuming here is enough.
		if (ctx.state === 'suspended') await ctx.resume();

		const osc = ctx.createOscillator();
		osc.type = 'triangle';
		osc.frequency.value = hz;
		const env = ctx.createGain();
		env.gain.setValueAtTime(0, ctx.currentTime);
		env.gain.linearRampToValueAtTime(this.gain, ctx.currentTime + this.attack);
		osc.connect(env);
		env.connect(ctx.destination);
		osc.start();

		this.voice = { osc, env };
		this.setPlaying(true);
		if (durationMs !== null) {
			this.stopTimer = setTimeout(() => this.stop(), durationMs);
		}
	}

	/** Release the current tone, if any. Safe to call when nothing is playing. */
	stop(): void {
		if (this.stopTimer) {
			clearTimeout(this.stopTimer);
			this.stopTimer = null;
		}
		const voice = this.voice;
		this.voice = null;
		if (voice && this.context) {
			const now = this.context.currentTime;
			voice.env.gain.cancelScheduledValues(now);
			voice.env.gain.setValueAtTime(voice.env.gain.value, now);
			voice.env.gain.linearRampToValueAtTime(0, now + this.release);
			voice.osc.stop(now + this.release);
		}
		this.setPlaying(false);
	}

	/** Stop and close the audio context. The player cannot be used afterwards. */
	destroy(): void {
		this.stop();
		const ctx = this.context;
		this.context = null;
		if (ctx && ctx.state !== 'closed') void ctx.close();
	}

	private setPlaying(playing: boolean): void {
		if (this._playing === playing) return;
		this._playing = playing;
		this.onChange?.(playing);
	}
}
