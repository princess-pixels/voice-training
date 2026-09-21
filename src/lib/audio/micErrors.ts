/**
 * Plain-language explanations for the ways opening a microphone fails, shared
 * by the studio, the range test and Settings. Pure: the browser error is
 * passed in, so bun test can cover every branch.
 *
 * getUserMedia rejects with a DOMException whose `name` says what happened;
 * the `message` is browser-specific and often empty. On a plain-HTTP address
 * that is not localhost there is no getUserMedia at all, which surfaces as a
 * TypeError from reading `undefined.getUserMedia` unless caught first.
 */

/** Thrown by mic.ts when the browser has no microphone API on this origin. */
export class MicUnavailableError extends Error {
	constructor() {
		super('The microphone API is not available on this page');
		this.name = 'MicUnavailableError';
	}
}

export const MIC_MESSAGES = {
	unavailable:
		'This page cannot use the microphone. Browsers only allow it on HTTPS or on localhost: open the app at the address in ORIGIN (see the README), or on the machine it runs on.',
	blocked:
		'Microphone access is blocked. Allow the microphone for this site from the icon in the address bar, then try again.',
	notFound:
		'No microphone found. Plug one in, or check the input device in Settings, then try again.',
	busy: 'The microphone could not start. Another app (a call, a recorder) may be using it; close that and try again.',
	gone: 'The chosen microphone is no longer available. Pick another input device in Settings.'
} as const;

/** True when this page can ask for the microphone at all. */
export function hasMicrophoneApi(): boolean {
	return (
		typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function'
	);
}

/** What to tell the user when opening the microphone threw `err`. */
export function describeMicError(err: unknown): string {
	const name = err instanceof Error ? err.name : '';
	const message = err instanceof Error ? err.message : String(err ?? '');
	switch (name) {
		case 'MicUnavailableError':
			return MIC_MESSAGES.unavailable;
		case 'NotAllowedError':
		case 'PermissionDeniedError':
		case 'SecurityError':
			return MIC_MESSAGES.blocked;
		case 'NotFoundError':
		case 'DevicesNotFoundError':
			return MIC_MESSAGES.notFound;
		case 'NotReadableError':
		case 'TrackStartError':
		case 'AbortError':
			return MIC_MESSAGES.busy;
		case 'OverconstrainedError':
		case 'ConstraintNotSatisfiedError':
			return MIC_MESSAGES.gone;
	}
	if (/getUserMedia|mediaDevices|enumerateDevices/.test(message)) return MIC_MESSAGES.unavailable;
	return message ? `Could not open the microphone: ${message}` : 'Could not open the microphone.';
}
