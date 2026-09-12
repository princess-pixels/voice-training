import { expect, test } from 'bun:test';
import { DEFAULT_YIN_OPTIONS, type PitchResult } from './yin';
import type { YinRequest } from './yin.worker';

function tone(hz: number, sampleRate: number, size = 4096): Float32Array {
	const buffer = new Float32Array(size);
	for (let i = 0; i < size; i++) {
		buffer[i] = 0.3 * Math.sin((2 * Math.PI * hz * i) / sampleRate);
	}
	return buffer;
}

/** Bun runs Web Workers natively, so the worker module is exercised as-is. */
async function ask(worker: Worker, buffer: Float32Array, sampleRate: number): Promise<PitchResult> {
	return new Promise((resolve, reject) => {
		worker.onmessage = (event: MessageEvent<PitchResult>) => resolve(event.data);
		worker.onerror = (event) => reject(new Error(event.message));
		const request: YinRequest = { buffer, sampleRate, options: DEFAULT_YIN_OPTIONS };
		worker.postMessage(request, [buffer.buffer]);
	});
}

test('the worker answers with the pitch of a transferred frame, and keeps answering', async () => {
	const worker = new Worker(new URL('./yin.worker.ts', import.meta.url).href);
	try {
		const first = await ask(worker, tone(220, 48000), 48000);
		expect(first.confidence).toBeGreaterThan(0.9);
		expect(Math.abs(first.hz - 220) / 220).toBeLessThan(0.005);

		// Second frame reuses the worker's scratch buffer.
		const second = await ask(worker, tone(330, 44100), 44100);
		expect(Math.abs(second.hz - 330) / 330).toBeLessThan(0.005);
	} finally {
		worker.terminate();
	}
});
