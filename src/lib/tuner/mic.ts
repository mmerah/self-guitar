// Microphone access for the tuner, with every failure mapped to an explanation the user can act on.

export type MicProblem = 'insecure' | 'unsupported' | 'denied' | 'no-mic' | 'busy' | 'silent';

export const MIC_HELP: Record<MicProblem, { title: string; body: string }> = {
	insecure: {
		title: 'Microphone needs a secure connection',
		body: 'Browsers only allow the microphone over HTTPS or on localhost. You opened Self-Guitar over plain HTTP on your network: use its HTTPS address (reverse proxy), a Tailscale HTTPS name (tailscale serve), or open it on localhost.'
	},
	unsupported: {
		title: 'No microphone support',
		body: "This browser doesn't offer microphone access. Try a current Safari, Chrome or Firefox."
	},
	denied: {
		title: 'Microphone access was blocked',
		body: 'Allow the microphone for this site (address bar › site settings; on iPhone: Settings › Safari › Microphone, or Settings › Self-Guitar for the installed app), then tap Start again.'
	},
	'no-mic': {
		title: 'No microphone found',
		body: 'Connect or enable a microphone (or a headset with one) and try again.'
	},
	busy: {
		title: 'The microphone is busy',
		body: 'Another app or tab is using it (a call, a recorder...). Close it and try again.'
	},
	silent: {
		title: 'The microphone sends no sound',
		body: 'Access was granted but no audio arrives. On iPhone/iPad this is a known Safari glitch: close Safari (or the installed app) completely from the app switcher, reopen it and try again. Elsewhere, check the input device and its mute switch.'
	}
};

/** Checks that can be done before asking (no prompt shown). */
export function micPrecheck(): MicProblem | null {
	if (typeof window !== 'undefined' && !window.isSecureContext) return 'insecure';
	if (!navigator.mediaDevices?.getUserMedia) return 'unsupported';
	return null;
}

export function classifyMicError(e: unknown): MicProblem {
	const name = (e as { name?: string })?.name;
	switch (name) {
		case 'NotAllowedError':
		case 'PermissionDeniedError':
		case 'SecurityError':
			return 'denied';
		case 'NotFoundError':
		case 'DevicesNotFoundError':
		case 'OverconstrainedError':
			return 'no-mic';
		case 'NotReadableError':
		case 'TrackStartError':
		case 'AbortError':
			return 'busy';
		default:
			return 'unsupported';
	}
}

/** Raw input for pitch detection: no echo cancellation, noise suppression or auto gain. */
export async function openMic(): Promise<MediaStream> {
	return navigator.mediaDevices.getUserMedia({
		audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
		video: false
	});
}

export function stopStream(stream: MediaStream | null) {
	stream?.getTracks().forEach((t) => t.stop());
}
