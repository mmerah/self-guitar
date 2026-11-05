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

const CONSTRAINTS: MediaStreamConstraints = {
	audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
	video: false
};

/**
 * Raw input for pitch detection: no echo cancellation, noise suppression or auto gain.
 * @deprecated A private stream outside the shared owner: use `acquireMic` / `releaseMic`.
 */
export async function openMic(): Promise<MediaStream> {
	return navigator.mediaDevices.getUserMedia(CONSTRAINTS);
}

export function stopStream(stream: MediaStream | null) {
	stream?.getTracks().forEach((t) => t.stop());
}

// ---- the shared mic and the iOS audio session ------------------------------------------------------
//
// Every mic user (tuner, ear play-back, note checking, calibration, recording) takes the one shared
// raw stream through `acquireMic(owner)` and gives it back with `releaseMic(owner)`; the tracks stop
// when the last owner lets go. The iOS audio session follows: 'play-and-record' while any owner
// holds the mic, 'playback' otherwise (plays through the silent switch like a media app). This is
// the only place that sets `navigator.audioSession.type`; getAudioContext() and the tab player call
// `applyAudioSession()` and so never switch it away from recording while the mic is held.

type AudioSessionType = 'playback' | 'play-and-record';

const owners = new Set<string>();
let shared: MediaStream | null = null;
let opening: Promise<MediaStream> | null = null;
/** Called with the mic's sample rate when the session switched to recording (see context.ts). */
let rateListener: ((rate: number) => void) | null = null;

const isLive = (s: MediaStream | null) =>
	!!s && s.getAudioTracks().some((t) => t.readyState === 'live');

/** The session the page needs now. */
export function audioSessionType(): AudioSessionType {
	return owners.size ? 'play-and-record' : 'playback';
}

/** Sets the iOS audio session (Safari 16.4+) to what the mic owners need; no-op elsewhere. */
export function applyAudioSession() {
	const session =
		typeof navigator === 'undefined'
			? undefined
			: (navigator as { audioSession?: { type: string } }).audioSession;
	const want = audioSessionType();
	if (session && session.type !== want) session.type = want;
}

/** Whether any owner holds the mic. */
export const micHeld = () => owners.size > 0;
/** Who holds it (tests, debugging). */
export const micOwners = () => [...owners];

/** context.ts registers here so a sample-rate change after the session switch rebuilds its context. */
export function onMicRate(fn: ((rate: number) => void) | null) {
	rateListener = fn;
}

/**
 * The shared raw mic stream for `owner` (one getUserMedia for all owners; acquiring twice under
 * one owner counts once). Rejects with the getUserMedia error (map it with classifyMicError).
 * An owner released while the prompt was open still gets the stream: check your own token.
 */
export async function acquireMic(owner: string): Promise<MediaStream> {
	const first = owners.size === 0;
	owners.add(owner);
	applyAudioSession();
	try {
		if (!isLive(shared)) {
			opening ??= navigator.mediaDevices.getUserMedia(CONSTRAINTS).finally(() => (opening = null));
			const s = await opening;
			if (s !== shared) {
				stopStream(shared);
				shared = s;
			}
		}
	} catch (e) {
		owners.delete(owner);
		applyAudioSession();
		throw e;
	}
	const stream = shared!;
	if (!owners.size) {
		// Everyone let go while the prompt was open.
		stopStream(stream);
		shared = null;
		return stream;
	}
	if (first) {
		const rate = stream.getAudioTracks()[0]?.getSettings?.().sampleRate;
		if (rate) rateListener?.(rate);
	}
	return stream;
}

/** `owner` is done with the mic; the tracks stop (and the session returns to playback) with the last one. */
export function releaseMic(owner: string): void {
	if (!owners.delete(owner)) return;
	if (owners.size) return;
	stopStream(shared);
	shared = null;
	applyAudioSession();
}
