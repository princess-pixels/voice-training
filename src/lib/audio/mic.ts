/**
 * Browser-only microphone access. Kept apart from utils.ts so that module
 * stays pure and fully testable under bun test.
 */
export async function getMicrophoneStream(deviceId?: string): Promise<MediaStream> {
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
	const devices = await navigator.mediaDevices.enumerateDevices();
	return devices.filter((d) => d.kind === 'audioinput');
}
