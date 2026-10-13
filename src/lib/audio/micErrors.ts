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
import { m } from '$lib/paraglide/messages';

/** Thrown by mic.ts when the browser has no microphone API on this origin. */
export class MicUnavailableError extends Error {
	constructor() {
		super('The microphone API is not available on this page');
		this.name = 'MicUnavailableError';
	}
}

// Getters, not strings: the text is looked up in the current locale each
// time it is read, never frozen at import.
export const MIC_MESSAGES = {
	get unavailable() {
		return m.common_mic_unavailable();
	},
	get blocked() {
		return m.common_mic_blocked();
	},
	get notFound() {
		return m.common_mic_not_found();
	},
	get busy() {
		return m.common_mic_busy();
	},
	get gone() {
		return m.common_mic_gone();
	}
};

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
	return message ? m.common_mic_failed_with({ message }) : m.common_mic_failed();
}
