// One AudioContext shared by the tools (tuner, metronome, chord sounds). Browsers (iOS above all)
// only let audio start from a user gesture, so call `getAudioContext()` inside a tap handler.
// The tab player's alphaTab synth keeps its own context.

let ctx: AudioContext | null = null;

/**
 * The shared context, resumed. `session` sets the iOS audio session: 'playback' plays through
 * the silent switch like a media app; the tuner needs 'play-and-record' while the mic is open.
 */
export function getAudioContext(
	session: 'playback' | 'play-and-record' = 'playback'
): AudioContext {
	const audioSession = (navigator as { audioSession?: { type: string } }).audioSession;
	if (audioSession && audioSession.type !== session) audioSession.type = session;
	if (!ctx || ctx.state === 'closed') {
		ctx = new AudioContext({ latencyHint: 'interactive' });
	}
	// Resumes a suspended (or iOS "interrupted") context; harmless when already running.
	if (ctx.state !== 'running') ctx.resume().catch(() => {});
	return ctx;
}
