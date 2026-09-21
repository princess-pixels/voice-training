import { MicUnavailableError, hasMicrophoneApi } from './micErrors';

/**
 * Browser-only microphone access. Kept apart from utils.ts so that module
 * stays pure and fully testable under bun test. Failures are thrown as they
 * come from the browser; describeMicError in micErrors.ts turns them into
 * something a person can act on.
 */
export async function getMicrophoneStream(deviceId?: string): Promise<MediaStream> {
	if (!hasMicrophoneApi()) throw new MicUnavailableError();
	const constraints: MediaStreamConstraints = {
		audio: deviceId
			? {
					deviceId: { exact: deviceId },
					echoCancellation: false,
					noiseSuppression: false,
					autoGainControl: false
				}
			: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
	};
	return navigator.mediaDevices.getUserMedia(constraints);
}

export async function getAudioDevices(): Promise<MediaDeviceInfo[]> {
	if (!hasMicrophoneApi()) throw new MicUnavailableError();
	const devices = await navigator.mediaDevices.enumerateDevices();
	return devices.filter((d) => d.kind === 'audioinput');
}
