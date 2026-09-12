/**
 * Runs the YIN estimator off the main thread. PitchDetector posts one analyser
 * frame per hop (the buffer is transferred, not copied) and gets a PitchResult
 * back. Nothing in here touches the DOM or Web Audio, so it also runs under
 * plain Worker semantics without an AudioContext.
 */
import { yin, type PitchResult, type YinOptions } from './yin';

export interface YinRequest {
	buffer: Float32Array;
	sampleRate: number;
	options: YinOptions;
}

let scratch: Float32Array | null = null;

addEventListener('message', (event: MessageEvent<YinRequest>) => {
	const { buffer, sampleRate, options } = event.data;
	if (!scratch || scratch.length < buffer.length / 2) {
		scratch = new Float32Array(buffer.length / 2);
	}
	const result: PitchResult = yin(buffer, sampleRate, options, scratch);
	postMessage(result);
});
