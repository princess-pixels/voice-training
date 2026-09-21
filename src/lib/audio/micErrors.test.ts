import { describe, expect, test } from 'bun:test';
import { MIC_MESSAGES, MicUnavailableError, describeMicError, hasMicrophoneApi } from './micErrors';

/** A DOMException as getUserMedia rejects with it: the name carries the meaning. */
function dom(name: string, message = ''): Error {
	const e = new Error(message);
	e.name = name;
	return e;
}

describe('describeMicError', () => {
	test('maps every getUserMedia rejection name to a sentence that says what to do', () => {
		const cases: [string, string][] = [
			['NotAllowedError', MIC_MESSAGES.blocked],
			['PermissionDeniedError', MIC_MESSAGES.blocked],
			['SecurityError', MIC_MESSAGES.blocked],
			['NotFoundError', MIC_MESSAGES.notFound],
			['DevicesNotFoundError', MIC_MESSAGES.notFound],
			['NotReadableError', MIC_MESSAGES.busy],
			['TrackStartError', MIC_MESSAGES.busy],
			['AbortError', MIC_MESSAGES.busy],
			['OverconstrainedError', MIC_MESSAGES.gone],
			['ConstraintNotSatisfiedError', MIC_MESSAGES.gone]
		];
		for (const [name, expected] of cases) {
			expect(describeMicError(dom(name, 'Permission denied'))).toBe(expected);
		}
	});

	test('a plain-HTTP LAN address has no API at all', () => {
		expect(describeMicError(new MicUnavailableError())).toBe(MIC_MESSAGES.unavailable);
		// What falls out of `navigator.mediaDevices.getUserMedia` when mediaDevices is undefined.
		expect(
			describeMicError(
				new TypeError("Cannot read properties of undefined (reading 'getUserMedia')")
			)
		).toBe(MIC_MESSAGES.unavailable);
		expect(describeMicError(new TypeError('navigator.mediaDevices is undefined'))).toBe(
			MIC_MESSAGES.unavailable
		);
	});

	test('anything else keeps the browser message, prefixed', () => {
		expect(describeMicError(new Error('AudioContext exploded'))).toBe(
			'Could not open the microphone: AudioContext exploded'
		);
		expect(describeMicError(dom('WeirdError'))).toBe('Could not open the microphone.');
		expect(describeMicError('nope')).toBe('Could not open the microphone: nope');
		expect(describeMicError(undefined)).toBe('Could not open the microphone.');
	});

	test('every message tells the user something to do', () => {
		for (const m of Object.values(MIC_MESSAGES)) {
			expect(m).toMatch(/try again|Settings|ORIGIN|Plug one in|Pick another/);
		}
	});
});

test('hasMicrophoneApi is false outside a browser', () => {
	expect(hasMicrophoneApi()).toBe(false);
});
